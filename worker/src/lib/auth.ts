import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppBindings, AdminUser, Env } from '../env';
import { fail } from './http';
import { can, type Permission } from './rbac';
import { randomToken, sha256Hex, nowIso } from './util';

const COOKIE = '__Host-admin_session';
const TTL = 60 * 60 * 12; // 12h

export async function createSession(c: Context<AppBindings>, admin: AdminUser): Promise<void> {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  await c.env.KV.put(`sess:${id}`, JSON.stringify({ ...admin, createdAt: Date.now() }), { expirationTtl: TTL });
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, secure ? COOKIE : 'admin_session', token, { httpOnly: true, secure, sameSite: 'Strict', path: '/', maxAge: TTL });
}

export async function destroySession(c: Context<AppBindings>): Promise<void> {
  const token = getCookie(c, COOKIE) || getCookie(c, 'admin_session');
  if (token) await c.env.KV.delete(`sess:${await sha256Hex(token)}`);
  deleteCookie(c, COOKIE, { path: '/', secure: true });
  deleteCookie(c, 'admin_session', { path: '/' });
}

export async function revokeAllSessionsFor(env: Env, adminId: number): Promise<void> {
  // Sessions are keyed by hashed token; record a revocation timestamp checked on each request.
  await env.KV.put(`revoked:${adminId}`, String(Date.now()), { expirationTtl: TTL });
}

/** Require a valid admin session. Also enforces a same-origin check on mutations (CSRF defence in depth). */
export const requireAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = getCookie(c, COOKIE) || getCookie(c, 'admin_session');
  if (!token) fail(401, 'অনুগ্রহ করে লগইন করুন', 'unauthenticated');
  const raw = await c.env.KV.get(`sess:${await sha256Hex(token)}`);
  if (!raw) fail(401, 'সেশনের মেয়াদ শেষ, আবার লগইন করুন', 'unauthenticated');
  const sess = JSON.parse(raw) as AdminUser & { createdAt: number };
  const revoked = Number((await c.env.KV.get(`revoked:${sess.id}`)) || 0);
  if (revoked && sess.createdAt < revoked) fail(401, 'সেশন বাতিল করা হয়েছে, আবার লগইন করুন', 'unauthenticated');

  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    const self = new URL(c.req.url).origin;
    if (origin && origin !== self) fail(403, 'অননুমোদিত উৎস', 'bad_origin');
    if (c.req.header('x-requested-with') !== 'admin') fail(403, 'অননুমোদিত অনুরোধ', 'csrf');
  }
  c.set('admin', { id: sess.id, email: sess.email, name: sess.name, role: sess.role });

  // Online status (throttled to once per minute per admin).
  const seenKey = `seen:${sess.id}`;
  if (!(await c.env.KV.get(seenKey))) {
    await c.env.KV.put(seenKey, '1', { expirationTtl: 60 });
    c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE admins SET last_seen_at = ? WHERE id = ?').bind(nowIso(), sess.id).run());
  }
  await next();
};

export function requirePerm(perm: Permission): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const admin = c.get('admin');
    if (!admin || !can(admin.role, perm)) fail(403, 'এই কাজের অনুমতি আপনার নেই', 'forbidden');
    await next();
  };
}

export function assertPerm(c: Context<AppBindings>, perm: Permission): void {
  const admin = c.get('admin');
  if (!admin || !can(admin.role, perm)) fail(403, 'এই কাজের অনুমতি আপনার নেই', 'forbidden');
}
