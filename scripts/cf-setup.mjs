#!/usr/bin/env node
/**
 * Cloudflare provisioning for CI (and for manual deploys from a laptop).
 *
 * Idempotent — safe to run on every deploy:
 *   1. finds (or registers) the account's workers.dev subdomain
 *   2. finds or creates the D1 database, KV namespace and R2 bucket
 *   3. checks custom domains (zone exists + active in THIS account, hostname not owned by another Worker)
 *   4. writes worker/wrangler.deploy.toml with the real ids (git-ignored)
 *   5. prints the live URLs (and writes them to $GITHUB_OUTPUT)
 *
 * Env:
 *   CLOUDFLARE_API_TOKEN     (required)  token from the "Edit Cloudflare Workers" template + "D1: Edit"
 *   CLOUDFLARE_ACCOUNT_ID    (optional)  auto-detected when the token can see exactly one account
 *   WORKER_NAME              (optional)  default "cwb-agency"  → https://cwb-agency.<subdomain>.workers.dev
 *   D1_DATABASE_NAME         (optional)  default "<WORKER_NAME>-db"; set to reuse an EMPTY existing database
 *   CUSTOM_DOMAIN            (optional)  one or more hostnames, comma-separated, e.g.
 *                                        "connectwithbayezid.it.com,www.connectwithbayezid.it.com" (first = main URL)
 *   CUSTOM_DOMAIN_TAKEOVER   (optional)  "true" = detach the hostname from another Worker that currently owns it
 *   PAGES_DOMAIN             (optional)  storefront copy on GitHub Pages, e.g. "shop.sayadbayezid.com"
 *                                        (sets PUBLIC_SITE_URL for canonical URLs + CORS; see scripts/export-static.mjs)
 *   WORKERS_DEV_SUBDOMAIN    (optional)  used only if the account has no workers.dev subdomain yet
 *   PAYMENT_MODE             (optional)  "sandbox" (default) | "live"
 *   ENABLE_BROWSER_RENDERING (optional)  "true" to add the Browser Rendering binding (real PDF invoices)
 *   META_PIXEL_ID            (optional)  default 1469319801771203
 *   APP_ENV                  (optional)  "production" (default) | "staging" — staging never loads tracking
 *
 * Flags: --dry-run   (no API calls; fake ids — used by tests to validate the generated config)
 *        --url-only  (only look up the workers.dev URL; creates nothing — used by the GitHub Pages workflow)
 */
import { writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const toml = (v) => JSON.stringify(v); // JSON strings are valid TOML basic strings

export class SetupError extends Error {}

export function readOptions(env) {
  const name = (env.WORKER_NAME || 'cwb-agency').trim();
  const clean = (d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const pagesDomain = clean(env.PAGES_DOMAIN || '');
  // A hostname served by GitHub Pages cannot also be a Worker custom domain.
  const domains = (env.CUSTOM_DOMAIN || '').split(',').map(clean).filter((d) => d && d !== pagesDomain);
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new SetupError(`WORKER_NAME "${name}" must be lowercase letters, digits and dashes`);
  for (const d of domains) if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new SetupError(`CUSTOM_DOMAIN "${d}" is not a hostname`);
  if (pagesDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(pagesDomain)) throw new SetupError(`PAGES_DOMAIN "${pagesDomain}" is not a hostname`);
  return {
    name,
    dbName: (env.D1_DATABASE_NAME || `${name}-db`).trim(),
    dbExplicit: !!(env.D1_DATABASE_NAME || '').trim(),
    domains,
    pagesDomain,
    takeover: env.CUSTOM_DOMAIN_TAKEOVER === 'true',
    wantedSubdomain: (env.WORKERS_DEV_SUBDOMAIN || '').trim().toLowerCase(),
    paymentMode: env.PAYMENT_MODE === 'live' ? 'live' : 'sandbox',
    browser: env.ENABLE_BROWSER_RENDERING === 'true',
    pixel: (env.META_PIXEL_ID ?? '1469319801771203').trim(),
    appEnv: env.APP_ENV === 'staging' ? 'staging' : 'production',
  };
}

function client(token, fetchImpl) {
  return async function cf(method, path, body) {
    const res = await fetchImpl(API + path, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({ success: false, errors: [{ code: res.status, message: res.statusText }] }));
    return { ok: res.ok && json.success !== false, status: res.status, result: json.result, errors: json.errors || [] };
  };
}
const errText = (r) => r.errors.map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${r.status}`;
const hasCode = (r, code) => r.errors.some((e) => Number(e.code) === code);

async function resolveAccount(cf, env) {
  if (env.CLOUDFLARE_ACCOUNT_ID) {
    const id = env.CLOUDFLARE_ACCOUNT_ID.trim();
    const r = await cf('GET', `/accounts/${id}`);
    return { id, name: r.ok ? r.result?.name || id : id };
  }
  const r = await cf('GET', '/accounts?per_page=50');
  if (!r.ok) throw new SetupError(`Cannot list accounts (${errText(r)}). Set the CLOUDFLARE_ACCOUNT_ID secret.`);
  if (r.result.length !== 1) throw new SetupError(`Token can see ${r.result.length} accounts — set the CLOUDFLARE_ACCOUNT_ID secret.`);
  return { id: r.result[0].id, name: r.result[0].name };
}

async function workersSubdomain(cf, acct, wanted, log) {
  const r = await cf('GET', `/accounts/${acct}/workers/subdomain`);
  if (r.ok && r.result?.subdomain) return r.result.subdomain;
  if (!wanted) {
    throw new SetupError(
      'This Cloudflare account has no workers.dev subdomain yet. Either open Cloudflare dashboard → Workers & Pages once ' +
        '(it asks you to pick one), or set the GitHub variable WORKERS_DEV_SUBDOMAIN (e.g. "cwbagency") and re-run.',
    );
  }
  const c = await cf('PUT', `/accounts/${acct}/workers/subdomain`, { subdomain: wanted });
  if (!c.ok) throw new SetupError(`Could not register workers.dev subdomain "${wanted}": ${errText(c)}`);
  log(`✓ registered workers.dev subdomain: ${wanted}`);
  return wanted;
}

async function listAllD1(cf, acct) {
  const all = [];
  for (let page = 1; page < 20; page++) {
    const l = await cf('GET', `/accounts/${acct}/d1/database?per_page=100&page=${page}`);
    if (!l.ok) break;
    all.push(...l.result);
    if (l.result.length < 100) break;
  }
  return all;
}

/** Real user tables of a database (the list API's num_tables is not reliable). null = could not inspect. */
async function tablesOf(cf, acct, uuid) {
  const q = await cf('POST', `/accounts/${acct}/d1/database/${uuid}/query`, {
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
  });
  if (!q.ok) return null;
  return (q.result?.[0]?.results || []).map((r) => r.name);
}

/** Refuse to mix this app's tables into a database that belongs to another project. */
async function assertCompatibleD1(cf, acct, db) {
  const tables = await tablesOf(cf, acct, db.uuid);
  if (!tables) return; // cannot inspect — let migrations decide
  const ours = tables.includes('orders') && tables.includes('packages');
  if (tables.length && !ours) {
    throw new SetupError(
      `The database "${db.name}" already contains tables from another project (${tables.slice(0, 8).join(', ')}${tables.length > 8 ? ', …' : ''}). ` +
        'Using it would mix data. Pick an EMPTY database for D1_DATABASE_NAME, or delete an unused database and remove the D1_DATABASE_NAME variable.',
    );
  }
}

/** Tables that only this app's schema has — used to recognise a database this app already set up. */
const OUR_MARKERS = ['orders', 'landing_pages', 'project_requirements'];
const isOurs = (tables) => !!tables && OUR_MARKERS.every((t) => tables.includes(t));

/**
 * Find or create the app database. Never blocks on the free-plan D1 limit if it can avoid it:
 *   1. D1_DATABASE_NAME (explicit)            → use it (refusing another project's database)
 *   2. "<worker>-db" exists                   → use it
 *   3. a database already holding THIS app    → use it (a database auto-picked on an earlier run)
 *   4. create "<worker>-db"
 *   5. limit reached → reuse an EMPTY database (verified 0 tables), preferring one named like the app
 */
async function ensureD1(cf, acct, opts, log, warn) {
  const byName = async (n) => {
    const l = await cf('GET', `/accounts/${acct}/d1/database?name=${encodeURIComponent(n)}&per_page=100`);
    if (!l.ok) throw new SetupError(`D1 list failed (${errText(l)}). Does the API token include "Account → D1 → Edit"?`);
    return l.result.find((d) => d.name === n) || null;
  };
  const wanted = opts.dbName;
  const found = await byName(wanted);
  if (found) {
    await assertCompatibleD1(cf, acct, found);
    return { id: found.uuid, name: found.name, created: false };
  }

  // Inspect every database once (real table lists; the list API's num_tables is unreliable).
  const all = await listAllD1(cf, acct);
  const described = [];
  for (const d of all) described.push({ db: d, tables: await tablesOf(cf, acct, d.uuid) });

  if (!opts.dbExplicit) {
    const mine = described.find((x) => isOurs(x.tables));
    if (mine) {
      log(`✓ using the database that already holds this app: ${mine.db.name}`);
      return { id: mine.db.uuid, name: mine.db.name, created: false };
    }
  }

  const c = await cf('POST', `/accounts/${acct}/d1/database`, { name: wanted });
  if (c.ok) return { id: c.result.uuid, name: wanted, created: true };
  const limitHit = hasCode(c, 7406) || /limit/i.test(errText(c));
  if (!limitHit) throw new SetupError(`D1 create failed: ${errText(c)}`);

  const empties = described.filter((x) => x.tables && x.tables.length === 0);
  if (!opts.dbExplicit && empties.length) {
    const tokens = opts.name.split('-').filter((t) => t.length >= 3);
    const pick = empties.find((x) => tokens.some((t) => x.db.name.includes(t))) || empties[0];
    warn(
      `Your account is at its D1 database limit (${all.length}), so instead of creating "${wanted}" this deploy uses the EMPTY database ` +
        `"${pick.db.name}" (checked: 0 tables). Later deploys keep using it. To choose another one, set the GitHub variable D1_DATABASE_NAME.`,
    );
    return { id: pick.db.uuid, name: pick.db.name, created: false, reused: true };
  }

  const rows = described
    .map(({ db, tables: t }) => {
      const what = t === null ? 'tables: unknown' : t.length === 0 ? 'EMPTY — can be reused' : `${t.length} tables: ${t.slice(0, 5).join(', ')}${t.length > 5 ? ', …' : ''}`;
      return `   • ${db.name}  (${what}; ${Math.round((db.file_size || 0) / 1024)} KB, created ${(db.created_at || '').slice(0, 10)})`;
    })
    .join('\n');
  throw new SetupError(
    `Your Cloudflare account already has the maximum number of D1 databases (${all.length}) on its plan, so "${wanted}" could not be created.\n` +
      `Existing databases:\n${rows}\n` +
      'Fix (pick one):\n' +
      '  A) Delete a database you no longer use: Cloudflare dashboard → Storage & databases → D1 → (database) → Settings → Delete. Then re-run this workflow.\n' +
      (empties.length
        ? '  B) Reuse a database marked EMPTY above: set the GitHub variable D1_DATABASE_NAME = <its name>, then re-run.'
        : '  B) (No empty database found — option A is needed.)'),
  );
}

async function ensureKV(cf, acct, title) {
  for (let page = 1; page < 20; page++) {
    const l = await cf('GET', `/accounts/${acct}/storage/kv/namespaces?per_page=100&page=${page}`);
    if (!l.ok) throw new SetupError(`KV list failed (${errText(l)}). Does the API token include "Workers KV Storage: Edit"?`);
    const found = l.result.find((n) => n.title === title);
    if (found) return { id: found.id, created: false };
    if (l.result.length < 100) break;
  }
  const c = await cf('POST', `/accounts/${acct}/storage/kv/namespaces`, { title });
  if (!c.ok) throw new SetupError(`KV create failed: ${errText(c)}`);
  return { id: c.result.id, created: true };
}

/** R2 needs a one-time activation in the dashboard; without it we deploy without file uploads. */
async function ensureR2(cf, acct, bucket) {
  const g = await cf('GET', `/accounts/${acct}/r2/buckets/${bucket}`);
  if (g.ok) return { ok: true, created: false };
  const c = await cf('POST', `/accounts/${acct}/r2/buckets`, { name: bucket });
  if (c.ok) return { ok: true, created: true };
  return { ok: false, reason: errText(c) };
}

/** Find the zone that contains `host` in this account (handles multi-label suffixes like it.com, co.uk). */
async function findZone(cf, acctId, host) {
  const labels = host.split('.');
  for (let i = 0; i <= labels.length - 2; i++) {
    const candidate = labels.slice(i).join('.');
    const r = await cf('GET', `/zones?name=${encodeURIComponent(candidate)}&account.id=${acctId}`);
    if (!r.ok) return { unknown: true, reason: errText(r) };
    if (r.result?.length) return { zone: r.result[0] };
  }
  return { zone: null };
}

async function checkCustomDomains(cf, acct, opts, log, warn) {
  for (const host of opts.domains) {
    const z = await findZone(cf, acct.id, host);
    if (z.unknown) {
      warn(`Could not verify the zone for ${host} (${z.reason}). Continuing — wrangler will report any problem.`);
      continue;
    }
    if (!z.zone) {
      const zl = await cf('GET', `/zones?account.id=${acct.id}&per_page=50`);
      const inAccount = zl.ok && zl.result?.length ? zl.result.map((x) => `${x.name} (${x.status})`).join(', ') : 'none';
      throw new SetupError(
        `"${host}" is not a domain in the Cloudflare account "${acct.name}". Domains in this account: ${inAccount}.\n` +
          'Custom domains only work for a domain that is ACTIVE in the SAME Cloudflare account as the API token. Fix: change the GitHub variable CUSTOM_DOMAIN to a domain listed above ' +
          '(or delete the variable to use only the workers.dev URL), or move this domain\'s DNS to this Cloudflare account first (docs/DEPLOY.md §6).',
      );
    }
    if (z.zone.status !== 'active') {
      throw new SetupError(`The domain ${z.zone.name} is "${z.zone.status}" on Cloudflare — it must be "active" (nameservers pointed to Cloudflare) before ${host} can be used.`);
    }
    const d = await cf('GET', `/accounts/${acct.id}/workers/domains?hostname=${encodeURIComponent(host)}`);
    const owner = d.ok ? (d.result || []).find((x) => x.hostname === host && x.service !== opts.name) : null;
    if (owner) {
      if (!opts.takeover) {
        throw new SetupError(
          `${host} is currently attached to another Worker ("${owner.service}"). Remove it there (Workers & Pages → ${owner.service} → Settings → Domains & Routes), ` +
            'or set the GitHub variable CUSTOM_DOMAIN_TAKEOVER = true to move it to this Worker automatically.',
        );
      }
      const del = await cf('DELETE', `/accounts/${acct.id}/workers/domains/${owner.id}`);
      if (!del.ok) throw new SetupError(`Could not detach ${host} from "${owner.service}": ${errText(del)}`);
      log(`✓ detached ${host} from old Worker "${owner.service}"`);
    }
    log(`✓ custom domain ${host} → zone ${z.zone.name} (active)`);
  }
}

export function renderConfig(opts, ids) {
  const routes = opts.domains.length
    ? `routes = [\n${opts.domains.map((d) => `  { pattern = ${toml(d)}, custom_domain = true },`).join('\n')}\n]`
    : '# no custom domain yet — set the CUSTOM_DOMAIN GitHub variable (domain must be active in this Cloudflare account)';
  return `# GENERATED by scripts/cf-setup.mjs — do not edit or commit (git-ignored).
name = ${toml(opts.name)}
main = "src/index.ts"
compatibility_date = "2026-10-01"
compatibility_flags = ["nodejs_compat"]
workers_dev = true
${routes}

[assets]
directory = "../dist"
binding = "ASSETS"
html_handling = "auto-trailing-slash"
not_found_handling = "none"

[vars]
SITE_URL = ${toml(ids.siteUrl)}
${opts.pagesDomain ? `PUBLIC_SITE_URL = ${toml(`https://${opts.pagesDomain}`)}\n` : ''}APP_ENV = ${toml(opts.appEnv)}
PAYMENT_MODE = ${toml(opts.paymentMode)}
META_PIXEL_ID = ${toml(opts.pixel)}
META_GRAPH_VERSION = "v21.0"

[[d1_databases]]
binding = "DB"
database_name = ${toml(opts.dbName)}
database_id = ${toml(ids.d1)}
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "KV"
id = ${toml(ids.kv)}
${ids.r2.ok ? `
[[r2_buckets]]
binding = "MEDIA"
bucket_name = ${toml(`${opts.name}-media`)}
` : `
# R2 not available (${ids.r2.reason}) — enable R2 in the dashboard and re-run to turn on uploads.
`}
[ai]
binding = "AI"
${opts.browser ? '\n[browser]\nbinding = "BROWSER"\n' : ''}
[triggers]
crons = ["17 * * * *"]

[observability]
enabled = true
`;
}

/** Look up the live workers.dev URL without creating anything. */
export async function workerUrl(env, { fetchImpl = fetch } = {}) {
  const opts = readOptions(env);
  if (!env.CLOUDFLARE_API_TOKEN) throw new SetupError('CLOUDFLARE_API_TOKEN is not set');
  const cf = client(env.CLOUDFLARE_API_TOKEN, fetchImpl);
  const acct = await resolveAccount(cf, env);
  const r = await cf('GET', `/accounts/${acct.id}/workers/subdomain`);
  if (!r.ok || !r.result?.subdomain) throw new SetupError('This Cloudflare account has no workers.dev subdomain yet — run the Deploy workflow first.');
  return `https://${opts.name}.${r.result.subdomain}.workers.dev`;
}

/** Main entry. Returns the summary; throws SetupError with a human-readable fix. */
export async function run(env, { fetchImpl = fetch, dry = false, log = console.log, warn = (m) => console.log(`::warning::${m}`) } = {}) {
  const opts = readOptions(env);
  if (!dry && !env.CLOUDFLARE_API_TOKEN) throw new SetupError('CLOUDFLARE_API_TOKEN is not set');
  const cf = client(env.CLOUDFLARE_API_TOKEN, fetchImpl);

  const acct = dry ? { id: '0'.repeat(32), name: 'dry-run' } : await resolveAccount(cf, env);
  log(`Cloudflare account: ${acct.name}`);
  const sub = dry ? 'example' : await workersSubdomain(cf, acct.id, opts.wantedSubdomain, log);
  const notes = [];
  const note = (m) => { notes.push(m); warn(m); };
  const d1 = dry ? { id: '11111111-1111-1111-1111-111111111111', name: opts.dbName, created: false } : await ensureD1(cf, acct.id, opts, log, note);
  // A custom-domain problem never blocks the Worker: deploy on workers.dev and explain what to fix.
  if (!dry && opts.domains.length) {
    try {
      await checkCustomDomains(cf, acct, opts, log, warn);
    } catch (e) {
      if (!(e instanceof SetupError)) throw e;
      note(`Custom domain skipped — the Worker is deployed on workers.dev only for now. ${e.message.replace(/\n/g, ' ')}`);
      opts.domains = [];
    }
  }
  const kv = dry ? { id: '2'.repeat(32), created: false } : await ensureKV(cf, acct.id, `${opts.name}-kv`);
  const r2 = dry ? { ok: true } : await ensureR2(cf, acct.id, `${opts.name}-media`);

  const workersDevUrl = `https://${opts.name}.${sub}.workers.dev`;
  const siteUrl = opts.domains.length ? `https://${opts.domains[0]}` : workersDevUrl;
  const config = renderConfig({ ...opts, dbName: d1.name }, { siteUrl, d1: d1.id, kv: kv.id, r2 });

  log([
    `Worker:            ${opts.name}`,
    `workers.dev URL:   ${workersDevUrl}`,
    `Custom domain(s):  ${opts.domains.length ? opts.domains.map((d) => `https://${d}`).join(', ') : '(not set yet)'}`,
    `GitHub Pages:      ${opts.pagesDomain ? `https://${opts.pagesDomain} (storefront copy; backend = this Worker)` : '(not used)'}`,
    `SITE_URL:          ${siteUrl}`,
    `D1:                ${d1.name} ${d1.created ? '(created)' : d1.reused ? '(reused empty database)' : '(existing)'}`,
    `KV:                ${opts.name}-kv ${kv.created ? '(created)' : '(existing)'}`,
    `R2:                ${r2.ok ? `${opts.name}-media ${r2.created ? '(created)' : '(existing)'}` : `disabled — ${r2.reason}`}`,
    `Payment mode:      ${opts.paymentMode}`,
  ].join('\n'));
  if (!r2.ok) note(`R2 is not enabled on this Cloudflare account (${r2.reason}). The site is deployed, but image/file uploads are off until you enable R2 (Dashboard → R2 → Get started) and re-run the deploy.`);

  return { config, siteUrl, workersDevUrl, domains: opts.domains, r2: r2.ok, name: opts.name, account: acct.name, database: d1.name, notes };
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.argv.includes('--url-only')) {
      const url = await workerUrl(process.env);
      console.log(url);
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `workers_dev_url=${url}\n`);
      process.exit(0);
    }
    const out = await run(process.env, { dry: process.argv.includes('--dry-run') });
    writeFileSync(new URL('../worker/wrangler.deploy.toml', import.meta.url), out.config);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, [
        `site_url=${out.siteUrl}`, `workers_dev_url=${out.workersDevUrl}`, `custom_domain=${out.domains.join(', ')}`,
        `r2=${out.r2}`, `worker_name=${out.name}`, `account=${out.account}`,
      ].join('\n') + '\n');
    }
    if (process.env.GITHUB_STEP_SUMMARY && out.notes.length) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ⚠️ Deploy notes\n\n${out.notes.map((n) => `- ${n}`).join('\n')}\n\n`);
    }
  } catch (e) {
    if (e instanceof SetupError) {
      for (const line of e.message.split('\n')) console.log(line);
      console.log(`::error title=Cloudflare setup::${e.message.split('\n')[0]}`);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ❌ Cloudflare setup needs your action\n\n\`\`\`\n${e.message}\n\`\`\`\n`);
      process.exit(1);
    }
    throw e;
  }
}
