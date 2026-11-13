import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { driveFetch, driveFileId, googleAccessToken, serviceAccount, signAssertion, DRIVE_SCOPE } from '../../worker/src/lib/google';
import { geminiProvider } from '../../worker/src/lib/ai-providers/gemini';
import { refreshStorefront, PUBLIC_CONTENT } from '../../worker/src/lib/storefront';
import { lessonVideo } from '../../worker/src/lib/courses';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { type: 'service_account', project_id: 'demo-proj', client_email: 'bot@demo-proj.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), token_uri: 'https://oauth2.googleapis.com/token' };
const SA_JSON = JSON.stringify(SA);

/** A tiny in-memory KV. */
function kv() {
  const m = new Map<string, string>();
  return {
    get: async (k: string, t?: string) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)!) : m.get(k)) : null),
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    _m: m,
  };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('Google service account', () => {
  it('reads the key from plain JSON or base64, and refuses anything else', () => {
    expect(serviceAccount({ GOOGLE_SERVICES_JSON: SA_JSON })?.client_email).toBe(SA.client_email);
    expect(serviceAccount({ GOOGLE_SERVICES_JSON: Buffer.from(SA_JSON).toString('base64') })?.project_id).toBe('demo-proj');
    expect(serviceAccount({ GOOGLE_SERVICES_JSON: '' })).toBeNull();
    expect(serviceAccount({ GOOGLE_SERVICES_JSON: '{"client_email":"x"}' })).toBeNull();
    expect(serviceAccount({ GOOGLE_SERVICES_JSON: 'not json' })).toBeNull();
  });

  it('signs a JWT that Google can verify with the account\'s public key (RS256)', async () => {
    const jwt = await signAssertion(serviceAccount({ GOOGLE_SERVICES_JSON: SA_JSON })!, DRIVE_SCOPE, 1_700_000_000);
    const [h, c, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({ iss: SA.client_email, scope: DRIVE_SCOPE, aud: SA.token_uri, iat: 1_700_000_000, exp: 1_700_003_600 });
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('gets a token once and reuses it; Google\'s refusal is reported without the key', async () => {
    const env = { GOOGLE_SERVICES_JSON: SA_JSON, KV: kv() } as any;
    const fetchMock = vi.fn().mockResolvedValue(json(200, { access_token: 'tok-1', expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await googleAccessToken(env, DRIVE_SCOPE)).toBe('tok-1');
    expect(await googleAccessToken(env, DRIVE_SCOPE)).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(body.get('assertion')?.split('.')).toHaveLength(3);

    const other = { GOOGLE_SERVICES_JSON: JSON.stringify({ ...SA, client_email: 'other@demo-proj.iam.gserviceaccount.com' }), KV: kv() } as any;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(400, { error: 'invalid_grant', error_description: 'account not found' })));
    const err = await googleAccessToken(other, DRIVE_SCOPE).catch((e) => e);
    expect(String(err.message)).toContain('invalid_grant');
    expect(String(err.message)).not.toContain('PRIVATE KEY');
  });

  it('finds the file id in every common Drive link', () => {
    expect(driveFileId('https://drive.google.com/file/d/1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8/view?usp=drivesdk')).toBe('1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8');
    expect(driveFileId('https://drive.google.com/open?id=1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8')).toBe('1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8');
    expect(driveFileId('https://drive.google.com/uc?id=1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8&export=download')).toBe('1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8');
    expect(driveFileId('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(driveFileId('https://evil.example/file/d/1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8')).toBeNull();
  });

  it('streams a Drive file with the token and passes Range through (seeking works)', async () => {
    // Its own account, so no token cached by the tests above is reused.
    const env = { GOOGLE_SERVICES_JSON: JSON.stringify({ ...SA, client_email: 'stream@demo-proj.iam.gserviceaccount.com' }), KV: kv() } as any;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(200, { access_token: 'tok-2', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response('0123', { status: 206, headers: { 'content-range': 'bytes 0-3/100' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await driveFetch(env, 'FILEID1234567890', 'bytes=0-3');
    expect(r.status).toBe(206);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain('/drive/v3/files/FILEID1234567890?alt=media');
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok-2', range: 'bytes=0-3' });
  });

  it('plays a lesson\'s Drive link through the site only when the service account is set', () => {
    const l = { id: 7, video_url: 'https://drive.google.com/file/d/1cb4Jcfs-sh-EAd7g1GjEl4BLDBp5FmE8/view' };
    expect(lessonVideo(l, 'https://w.example', true)).toEqual({ kind: 'file', src: 'https://w.example/learn/video/7' });
    expect(lessonVideo(l, '', false)?.kind).toBe('drive'); // no service account: Google's own player (file must be shared)
  });
});

describe('Gemini through Vertex AI (service account)', () => {
  const input = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 20 };
  const vertex = { url: (m: string) => `https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/${m}:generateContent`, token: async () => 'vtok' };
  const okText = (t: string) => json(200, { candidates: [{ content: { parts: [{ text: t }] }, finishReason: 'STOP' }] });

  it('answers through Vertex when there is no API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okText('OK'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await geminiProvider(undefined, 'gemini-flash-latest', vertex).generate(input)).toBe('OK');
    expect(fetchMock.mock.calls[0][0]).toContain('aiplatform.googleapis.com');
    expect(fetchMock.mock.calls[0][0]).toContain('gemini-2.5-flash'); // Vertex has no "-latest" alias
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer vtok');
  });

  it('falls back to Vertex when Google refuses the API key', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(429, { error: { message: 'quota' } })).mockResolvedValueOnce(okText('বিকল্প'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await geminiProvider('k', 'gemini-2.5-flash', vertex).generate(input)).toBe('বিকল্প');
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
    expect(fetchMock.mock.calls[1][0]).toContain('aiplatform.googleapis.com');
  });

  it('still reports a missing key when neither route exists', async () => {
    await expect(geminiProvider(undefined, 'gemini-2.5-flash').generate(input)).rejects.toThrow('missing_key');
  });
});

describe('public storefront refresh', () => {
  it('does nothing without a token, and starts the Pages workflow with one', async () => {
    const base = { PUBLIC_SITE_URL: 'https://shop.example.com', GITHUB_REPO: 'owner/repo', KV: kv() } as any;
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await refreshStorefront(base, 'test')).detail).toBe('no_token');
    expect(fetchMock).not.toHaveBeenCalled();
    const r = await refreshStorefront({ ...base, PAGES_REFRESH_TOKEN: 'ghp_x' }, 'PUT /packages/1');
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/owner/repo/actions/workflows/pages.yml/dispatches');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ref: 'main' });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer ghp_x');
  });

  it('runs after changes to public content only (not orders, leads or students)', () => {
    for (const p of ['/api/admin/packages/3', '/api/admin/offers', '/api/admin/courses/1', '/api/admin/settings', '/api/admin/course-lessons/9']) expect(PUBLIC_CONTENT.test(p), p).toBe(true);
    for (const p of ['/api/admin/orders/3', '/api/admin/leads/1', '/api/admin/students/2', '/api/admin/uploads', '/api/admin/auth/login']) expect(PUBLIC_CONTENT.test(p), p).toBe(false);
  });
});
