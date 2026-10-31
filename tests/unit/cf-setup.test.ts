import { describe, expect, it } from 'vitest';
import { run, SetupError } from '../../scripts/cf-setup.mjs';

type Handler = (method: string, path: string, body: any) => { status?: number; body: any } | undefined;

/** Minimal fake of the Cloudflare API. */
function fakeCf(state: {
  dbs?: { uuid: string; name: string; num_tables?: number }[];
  dbLimit?: number;
  tables?: Record<string, string[]>;
  zones?: { name: string; status: string }[];
  workerDomains?: { id: string; hostname: string; service: string }[];
  r2Enabled?: boolean;
  extra?: Handler;
}) {
  const calls: string[] = [];
  const ok = (result: unknown) => ({ body: { success: true, result, errors: [] } });
  const err = (status: number, code: number, message: string) => ({ status, body: { success: false, result: null, errors: [{ code, message }] } });
  const dbs = state.dbs ?? [];
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const path = u.pathname.replace('/client/v4', '') + u.search;
    const method = init?.method || 'GET';
    calls.push(`${method} ${path}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    let r = state.extra?.(method, path, body);
    if (!r) {
      if (path.startsWith('/accounts/acct1/workers/subdomain')) r = ok({ subdomain: 'cwbagency' });
      else if (/^\/accounts\/acct1$/.test(u.pathname.replace('/client/v4', ''))) r = ok({ id: 'acct1', name: 'Bayezid' });
      else if (path.startsWith('/accounts/acct1/d1/database?name=')) r = ok(dbs.filter((d) => d.name === u.searchParams.get('name')));
      else if (path.startsWith('/accounts/acct1/d1/database?')) r = ok(dbs);
      else if (method === 'POST' && u.pathname.endsWith('/d1/database')) {
        if (dbs.length >= (state.dbLimit ?? 10)) r = err(400, 7406, `System limit reached: databases per account (${state.dbLimit ?? 10})`);
        else { dbs.push({ uuid: 'new-db', name: body.name }); r = ok({ uuid: 'new-db' }); }
      } else if (method === 'POST' && /\/d1\/database\/[^/]+\/query$/.test(u.pathname)) {
        const id = u.pathname.split('/').at(-2)!;
        r = ok([{ results: (state.tables?.[id] || []).map((name) => ({ name })) }]);
      } else if (path.startsWith('/accounts/acct1/storage/kv/namespaces') && method === 'GET') r = ok([]);
      else if (path.startsWith('/accounts/acct1/storage/kv/namespaces')) r = ok({ id: 'kv1' });
      else if (u.pathname.includes('/r2/buckets')) r = state.r2Enabled === false ? err(403, 10042, 'Please enable R2 through the Cloudflare Dashboard.') : ok({});
      else if (u.pathname.endsWith('/zones')) r = ok((state.zones || []).filter((z) => z.name === u.searchParams.get('name')));
      else if (method === 'GET' && u.pathname.endsWith('/workers/domains')) r = ok((state.workerDomains || []).filter((d) => d.hostname === u.searchParams.get('hostname')));
      else if (method === 'DELETE' && u.pathname.includes('/workers/domains/')) r = ok(null);
    }
    if (!r) throw new Error(`unexpected call ${method} ${path}`);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

const env = { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'acct1' };
const quiet = { log: () => {}, warn: () => {} };

describe('cf-setup', () => {
  it('creates resources and points SITE_URL at workers.dev', async () => {
    const { impl } = fakeCf({});
    const r = await run(env, { fetchImpl: impl, ...quiet });
    expect(r.workersDevUrl).toBe('https://cwb-agency.cwbagency.workers.dev');
    expect(r.siteUrl).toBe(r.workersDevUrl);
    expect(r.account).toBe('Bayezid');
    expect(r.config).toContain('database_id = "new-db"');
    expect(r.config).not.toContain('custom_domain = true');
  });

  it('explains the D1 database limit and lists existing databases', async () => {
    const dbs = Array.from({ length: 10 }, (_, i) => ({ uuid: `u${i}`, name: `old-project-${i}`, num_tables: i === 3 ? 0 : 5 }));
    const { impl } = fakeCf({ dbs });
    const e = await run(env, { fetchImpl: impl, ...quiet }).catch((x) => x);
    expect(e).toBeInstanceOf(SetupError);
    expect(e.message).toContain('maximum number of D1 databases (10)');
    expect(e.message).toContain('old-project-3  (tables: 0');
    expect(e.message).toContain('D1_DATABASE_NAME');
  });

  it('reuses an empty existing database via D1_DATABASE_NAME', async () => {
    const { impl } = fakeCf({ dbs: [{ uuid: 'empty1', name: 'spare' }], tables: { empty1: [] } });
    const r = await run({ ...env, D1_DATABASE_NAME: 'spare' }, { fetchImpl: impl, ...quiet });
    expect(r.config).toContain('database_id = "empty1"');
  });

  it('refuses a database that belongs to another project', async () => {
    const { impl } = fakeCf({ dbs: [{ uuid: 'x', name: 'blog' }], tables: { x: ['posts', 'users'] } });
    await expect(run({ ...env, D1_DATABASE_NAME: 'blog' }, { fetchImpl: impl, ...quiet })).rejects.toThrow(/another project/);
  });

  it('accepts its own database on re-deploy', async () => {
    const { impl } = fakeCf({ dbs: [{ uuid: 'mine', name: 'cwb-agency-db' }], tables: { mine: ['orders', 'packages', 'd1_migrations'] } });
    const r = await run(env, { fetchImpl: impl, ...quiet });
    expect(r.config).toContain('database_id = "mine"');
  });

  it('supports several custom domains on a multi-label suffix (it.com) and uses the first as SITE_URL', async () => {
    const { impl } = fakeCf({ zones: [{ name: 'connectwithbayezid.it.com', status: 'active' }] });
    const r = await run({ ...env, CUSTOM_DOMAIN: 'connectwithbayezid.it.com, www.connectwithbayezid.it.com' }, { fetchImpl: impl, ...quiet });
    expect(r.siteUrl).toBe('https://connectwithbayezid.it.com');
    expect(r.config).toContain('{ pattern = "connectwithbayezid.it.com", custom_domain = true }');
    expect(r.config).toContain('{ pattern = "www.connectwithbayezid.it.com", custom_domain = true }');
    expect(r.config).toContain('SITE_URL = "https://connectwithbayezid.it.com"');
  });

  it('rejects a domain that is not in this Cloudflare account, or not active', async () => {
    const a = fakeCf({ zones: [] });
    await expect(run({ ...env, CUSTOM_DOMAIN: 'shop.connectwithbayezid.it.com' }, { fetchImpl: a.impl, ...quiet })).rejects.toThrow(/not a domain in the Cloudflare account "Bayezid"/);
    const b = fakeCf({ zones: [{ name: 'sayadbayezid.com', status: 'pending' }] });
    await expect(run({ ...env, CUSTOM_DOMAIN: 'shop.sayadbayezid.com' }, { fetchImpl: b.impl, ...quiet })).rejects.toThrow(/"pending"/);
  });

  it('only takes a hostname away from an old Worker when CUSTOM_DOMAIN_TAKEOVER=true', async () => {
    const state = { zones: [{ name: 'connectwithbayezid.it.com', status: 'active' }], workerDomains: [{ id: 'd1', hostname: 'connectwithbayezid.it.com', service: 'absvai' }] };
    const a = fakeCf(state);
    await expect(run({ ...env, CUSTOM_DOMAIN: 'connectwithbayezid.it.com' }, { fetchImpl: a.impl, ...quiet })).rejects.toThrow(/attached to another Worker \("absvai"\)/);
    const b = fakeCf(state);
    await run({ ...env, CUSTOM_DOMAIN: 'connectwithbayezid.it.com', CUSTOM_DOMAIN_TAKEOVER: 'true' }, { fetchImpl: b.impl, ...quiet });
    expect(b.calls).toContain('DELETE /accounts/acct1/workers/domains/d1');
  });

  it('deploys without R2 when R2 is not enabled', async () => {
    const { impl } = fakeCf({ r2Enabled: false });
    const r = await run(env, { fetchImpl: impl, ...quiet });
    expect(r.r2).toBe(false);
    expect(r.config).not.toContain('[[r2_buckets]]');
  });
});
