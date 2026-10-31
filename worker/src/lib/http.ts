import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

/** Throw a Bangla error to the caller. */
export function fail(status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503, message: string, code?: string): never {
  throw new HTTPException(status, { res: new Response(JSON.stringify({ ok: false, error: message, code }), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }) });
}

export const ok = <T>(c: Context, data: T, status: 200 | 201 = 200) => c.json({ ok: true, data }, status);

export async function readJson<T = Record<string, unknown>>(c: Context): Promise<T> {
  try {
    const len = Number(c.req.header('content-length') || '0');
    if (len > 256 * 1024) fail(422, 'অনুরোধটি খুব বড়');
    return (await c.req.json()) as T;
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    fail(400, 'অনুরোধের তথ্য সঠিক নয়');
  }
}

/** R2 is optional (it must be activated in the Cloudflare dashboard). */
export function requireMedia(env: { MEDIA?: R2Bucket }): R2Bucket {
  if (!env.MEDIA) fail(503, 'ফাইল সংরক্ষণ (আর২) এখনো চালু করা হয়নি — ক্লাউডফ্লেয়ার ড্যাশবোর্ডে আর২ চালু করে আবার ডিপ্লয় করুন', 'storage_disabled');
  return env.MEDIA;
}
