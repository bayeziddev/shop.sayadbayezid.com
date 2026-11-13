import type { Env } from '../env';

/**
 * Google service account (GOOGLE_SERVICES_JSON secret): the Worker signs its own OAuth token with the account's
 * private key (RS256, WebCrypto) and uses it for
 *  - Google Drive: course videos and files shared only with the service account's email, streamed to enrolled
 *    students through the Worker — the Drive file itself stays private and its link never reaches the browser;
 *  - Vertex AI Gemini: a second way to reach Gemini when the GEMINI_API_KEY is missing or refused.
 * The private key never leaves the Worker and never appears in a response, log or error message.
 */
export interface ServiceAccount { client_email: string; private_key: string; project_id: string; token_uri: string }

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/** The service account from the secret (plain JSON or base64 of it), or null when it is missing or unusable. */
export function serviceAccount(env: Pick<Env, 'GOOGLE_SERVICES_JSON'>): ServiceAccount | null {
  const raw = (env.GOOGLE_SERVICES_JSON || '').trim();
  if (!raw) return null;
  let text = raw;
  if (!raw.startsWith('{')) {
    try { text = atob(raw); } catch { return null; }
  }
  try {
    const j = JSON.parse(text) as Partial<ServiceAccount> & { type?: string };
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: j.private_key, project_id: j.project_id || '', token_uri: j.token_uri || 'https://oauth2.googleapis.com/token' };
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(typeof bytes === 'string' ? unescape(encodeURIComponent(s)) : s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** A signed JWT assertion for Google's token endpoint. Exported for tests. */
export async function signAssertion(sa: ServiceAccount, scope: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri, iat: nowSec, exp: nowSec + 3600 }));
  const key = await importKey(sa.private_key);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`)));
  return `${head}.${claims}.${b64url(sig)}`;
}

export class GoogleError extends Error {
  constructor(public step: 'config' | 'token' | 'drive' | 'vertex', public status: number, message: string) {
    super(`${step}: ${message}`);
  }
}

/** Google's error text, short — it never contains the key or the token. */
async function googleReason(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string | { message?: string; status?: string }; error_description?: string } | null;
  const e = body?.error;
  const msg = typeof e === 'string' ? `${e}${body?.error_description ? `: ${body.error_description}` : ''}` : e?.message || e?.status || '';
  return `http_${res.status}${msg ? `: ${String(msg).replace(/\s+/g, ' ').slice(0, 180)}` : ''}`;
}

const memo = new Map<string, { token: string; exp: number }>();

/** An access token for the scope; cached in memory and in KV until 5 minutes before it expires. */
export async function googleAccessToken(env: Env, scope: string): Promise<string> {
  const sa = serviceAccount(env);
  if (!sa) throw new GoogleError('config', 0, 'GOOGLE_SERVICES_JSON is missing or not a service-account JSON');
  const cacheKey = `gsa:tok:${sa.client_email}:${scope}`;
  const now = Date.now();
  const m = memo.get(cacheKey);
  if (m && m.exp > now) return m.token;
  const cached = await env.KV.get(cacheKey, 'json').catch(() => null) as { token: string; exp: number } | null;
  if (cached && cached.exp > now) { memo.set(cacheKey, cached); return cached.token; }
  let assertion: string;
  try {
    assertion = await signAssertion(sa, scope);
  } catch {
    throw new GoogleError('config', 0, 'the private_key in GOOGLE_SERVICES_JSON could not be read');
  }
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new GoogleError('token', res.status, await googleReason(res));
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  const entry = { token: j.access_token, exp: now + Math.max(60, (j.expires_in || 3600) - 300) * 1000 };
  memo.set(cacheKey, entry);
  await env.KV.put(cacheKey, JSON.stringify(entry), { expirationTtl: Math.max(60, Math.floor((entry.exp - now) / 1000)) }).catch(() => {});
  return entry.token;
}

/* ---------------- Google Drive ---------------- */

/** The file id in any common Drive link (…/file/d/<id>/view, open?id=, uc?id=), or a bare id. */
export function driveFileId(input: string): string | null {
  const s = String(input || '').trim();
  if (/^[\w-]{20,}$/.test(s)) return s;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return null;
  const id = u.pathname.match(/\/(?:file\/)?d\/([\w-]{10,})/)?.[1] || u.searchParams.get('id');
  return id && /^[\w-]{10,}$/.test(id) ? id : null;
}

export interface DriveMeta { id: string; name: string; mimeType: string; size: number | null }

export async function driveMeta(env: Env, id: string): Promise<DriveMeta> {
  const token = await googleAccessToken(env, DRIVE_SCOPE);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size&supportsAllDrives=true`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new GoogleError('drive', res.status, await googleReason(res));
  const j = (await res.json()) as { id: string; name: string; mimeType: string; size?: string };
  return { id: j.id, name: j.name, mimeType: j.mimeType, size: j.size ? Number(j.size) : null };
}

/** Stream a Drive file's bytes (Range passed through, so video seeking works). */
export async function driveFetch(env: Env, id: string, range?: string | null): Promise<Response> {
  const token = await googleAccessToken(env, DRIVE_SCOPE);
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=false`, {
    headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) },
  });
}

/* ---------------- Vertex AI (Gemini through the service account) ---------------- */

export function vertexUrl(sa: ServiceAccount, model: string): string {
  return `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/locations/global/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}
