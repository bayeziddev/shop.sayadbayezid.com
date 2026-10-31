#!/usr/bin/env node
/**
 * Cloudflare provisioning for CI (and for manual deploys from a laptop).
 *
 * Idempotent — safe to run on every deploy:
 *   1. finds (or registers) the account's workers.dev subdomain
 *   2. finds or creates the D1 database, KV namespace and R2 bucket
 *   3. writes worker/wrangler.deploy.toml with the real ids (git-ignored)
 *   4. prints the live URLs (and writes them to $GITHUB_OUTPUT / $GITHUB_STEP_SUMMARY)
 *
 * Env:
 *   CLOUDFLARE_API_TOKEN   (required)  token from the "Edit Cloudflare Workers" template + "D1: Edit"
 *   CLOUDFLARE_ACCOUNT_ID  (optional)  auto-detected when the token can see exactly one account
 *   WORKER_NAME            (optional)  default "cwb-agency"  → https://cwb-agency.<subdomain>.workers.dev
 *   CUSTOM_DOMAIN          (optional)  e.g. "shop.sayadbayezid.com" — only once the domain's DNS is on Cloudflare
 *   WORKERS_DEV_SUBDOMAIN  (optional)  used only if the account has no workers.dev subdomain yet
 *   PAYMENT_MODE           (optional)  "sandbox" (default) | "live"
 *   ENABLE_BROWSER_RENDERING (optional) "true" to add the Browser Rendering binding (real PDF invoices)
 *   META_PIXEL_ID          (optional)  default 1469319801771203
 *   APP_ENV                (optional)  "production" (default) | "staging" — staging never loads tracking
 *
 * Flags: --dry-run  (no API calls; fake ids — used by tests to validate the generated config)
 */
import { writeFileSync, appendFileSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
const API = 'https://api.cloudflare.com/client/v4';
const token = process.env.CLOUDFLARE_API_TOKEN;
const name = (process.env.WORKER_NAME || 'cwb-agency').trim();
const customDomain = (process.env.CUSTOM_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const paymentMode = process.env.PAYMENT_MODE === 'live' ? 'live' : 'sandbox';
const browser = process.env.ENABLE_BROWSER_RENDERING === 'true';
const pixel = (process.env.META_PIXEL_ID ?? '1469319801771203').trim();
// Anything other than production (e.g. a staging Worker) loads no tracking tags and sends no CAPI events.
const appEnv = ['production', 'staging'].includes(process.env.APP_ENV || '') ? process.env.APP_ENV : 'production';

if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new Error(`WORKER_NAME "${name}" must be lowercase letters, digits and dashes`);
if (customDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(customDomain)) throw new Error(`CUSTOM_DOMAIN "${customDomain}" is not a hostname`);
if (!DRY && !token) throw new Error('CLOUDFLARE_API_TOKEN is not set');

async function cf(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ success: false, errors: [{ code: res.status, message: res.statusText }] }));
  return { ok: res.ok && json.success !== false, status: res.status, result: json.result, errors: json.errors || [] };
}
const errText = (r) => r.errors.map((e) => `${e.code}: ${e.message}`).join('; ') || `HTTP ${r.status}`;

async function accountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID.trim();
  const r = await cf('GET', '/accounts?per_page=50');
  if (!r.ok) throw new Error(`Cannot list accounts (${errText(r)}). Set the CLOUDFLARE_ACCOUNT_ID secret.`);
  if (r.result.length !== 1) throw new Error(`Token can see ${r.result.length} accounts — set the CLOUDFLARE_ACCOUNT_ID secret.`);
  return r.result[0].id;
}

async function workersSubdomain(acct) {
  const r = await cf('GET', `/accounts/${acct}/workers/subdomain`);
  if (r.ok && r.result?.subdomain) return r.result.subdomain;
  const wanted = (process.env.WORKERS_DEV_SUBDOMAIN || '').trim().toLowerCase();
  if (!wanted) {
    throw new Error(
      'This Cloudflare account has no workers.dev subdomain yet. Either open Cloudflare dashboard → Workers & Pages once ' +
        '(it asks you to pick one), or set the GitHub variable WORKERS_DEV_SUBDOMAIN (e.g. "cwbagency") and re-run.',
    );
  }
  const c = await cf('PUT', `/accounts/${acct}/workers/subdomain`, { subdomain: wanted });
  if (!c.ok) throw new Error(`Could not register workers.dev subdomain "${wanted}": ${errText(c)}`);
  console.log(`✓ registered workers.dev subdomain: ${wanted}`);
  return wanted;
}

async function ensureD1(acct, dbName) {
  const l = await cf('GET', `/accounts/${acct}/d1/database?name=${encodeURIComponent(dbName)}&per_page=100`);
  if (!l.ok) throw new Error(`D1 list failed (${errText(l)}). Does the API token include "D1: Edit"?`);
  const found = l.result.find((d) => d.name === dbName);
  if (found) return { id: found.uuid, created: false };
  const c = await cf('POST', `/accounts/${acct}/d1/database`, { name: dbName });
  if (!c.ok) throw new Error(`D1 create failed: ${errText(c)}`);
  return { id: c.result.uuid, created: true };
}

async function ensureKV(acct, title) {
  for (let page = 1; page < 20; page++) {
    const l = await cf('GET', `/accounts/${acct}/storage/kv/namespaces?per_page=100&page=${page}`);
    if (!l.ok) throw new Error(`KV list failed (${errText(l)}). Does the API token include "Workers KV Storage: Edit"?`);
    const found = l.result.find((n) => n.title === title);
    if (found) return { id: found.id, created: false };
    if (l.result.length < 100) break;
  }
  const c = await cf('POST', `/accounts/${acct}/storage/kv/namespaces`, { title });
  if (!c.ok) throw new Error(`KV create failed: ${errText(c)}`);
  return { id: c.result.id, created: true };
}

/** R2 needs a one-time activation in the dashboard; without it we deploy without file uploads. */
async function ensureR2(acct, bucket) {
  const g = await cf('GET', `/accounts/${acct}/r2/buckets/${bucket}`);
  if (g.ok) return { ok: true, created: false };
  const c = await cf('POST', `/accounts/${acct}/r2/buckets`, { name: bucket });
  if (c.ok) return { ok: true, created: true };
  return { ok: false, reason: errText(c) };
}

const toml = (v) => JSON.stringify(v); // JSON strings are valid TOML basic strings

const acct = DRY ? '00000000000000000000000000000000' : await accountId();
const sub = DRY ? 'example' : await workersSubdomain(acct);
const d1 = DRY ? { id: '11111111-1111-1111-1111-111111111111', created: false } : await ensureD1(acct, `${name}-db`);
const kv = DRY ? { id: '22222222222222222222222222222222', created: false } : await ensureKV(acct, `${name}-kv`);
const r2 = DRY ? { ok: true } : await ensureR2(acct, `${name}-media`);

const workersDevUrl = `https://${name}.${sub}.workers.dev`;
const siteUrl = customDomain ? `https://${customDomain}` : workersDevUrl;

const config = `# GENERATED by scripts/cf-setup.mjs — do not edit or commit (git-ignored).
name = ${toml(name)}
main = "src/index.ts"
compatibility_date = "2026-10-01"
compatibility_flags = ["nodejs_compat"]
workers_dev = true
${customDomain ? `routes = [{ pattern = ${toml(customDomain)}, custom_domain = true }]` : '# no custom domain yet — set the CUSTOM_DOMAIN GitHub variable once DNS is on Cloudflare'}

[assets]
directory = "../dist"
binding = "ASSETS"
html_handling = "auto-trailing-slash"
not_found_handling = "none"

[vars]
SITE_URL = ${toml(siteUrl)}
APP_ENV = ${toml(appEnv)}
PAYMENT_MODE = ${toml(paymentMode)}
META_PIXEL_ID = ${toml(pixel)}
META_GRAPH_VERSION = "v21.0"

[[d1_databases]]
binding = "DB"
database_name = ${toml(`${name}-db`)}
database_id = ${toml(d1.id)}
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "KV"
id = ${toml(kv.id)}
${r2.ok ? `
[[r2_buckets]]
binding = "MEDIA"
bucket_name = ${toml(`${name}-media`)}
` : `
# R2 not available (${r2.reason}) — enable R2 in the dashboard and re-run to turn on uploads.
`}
[ai]
binding = "AI"
${browser ? '\n[browser]\nbinding = "BROWSER"\n' : ''}
[triggers]
crons = ["17 * * * *"]

[observability]
enabled = true
`;

writeFileSync(new URL('../worker/wrangler.deploy.toml', import.meta.url), config);

const lines = [
  `Worker:            ${name}`,
  `workers.dev URL:   ${workersDevUrl}`,
  `Custom domain:     ${customDomain ? `https://${customDomain}` : '(not set yet)'}`,
  `SITE_URL:          ${siteUrl}`,
  `D1:                ${name}-db ${d1.created ? '(created)' : '(existing)'}`,
  `KV:                ${name}-kv ${kv.created ? '(created)' : '(existing)'}`,
  `R2:                ${r2.ok ? `${name}-media ${r2.created ? '(created)' : '(existing)'}` : `disabled — ${r2.reason}`}`,
  `Payment mode:      ${paymentMode}`,
];
console.log(lines.join('\n'));

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `site_url=${siteUrl}`, `workers_dev_url=${workersDevUrl}`, `custom_domain=${customDomain}`, `r2=${r2.ok}`, `worker_name=${name}`,
  ].join('\n') + '\n');
}
if (!r2.ok) console.log(`::warning::R2 is not enabled on this Cloudflare account (${r2.reason}). The site is deployed, but image/file uploads are off until you enable R2 (Dashboard → R2 → Get started) and re-run the deploy.`);
