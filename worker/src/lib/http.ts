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
