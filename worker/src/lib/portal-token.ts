import type { Env } from '../env';
import { hmacSha256Hex } from './crypto';
import { safeEqual } from './util';

/**
 * Client portal access token = HMAC(SESSION_SECRET, order number).
 * Nothing is stored, so links in notifications can always be regenerated; rotating
 * SESSION_SECRET invalidates every outstanding portal link at once (incident response).
 */
export async function portalToken(env: Env, orderNumber: string): Promise<string> {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET secret is not configured');
  return (await hmacSha256Hex(env.SESSION_SECRET, `portal:${orderNumber}`)).slice(0, 40);
}

export async function verifyPortalToken(env: Env, orderNumber: string, token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  return safeEqual(await portalToken(env, orderNumber), token);
}

export async function portalUrl(env: Env, orderNumber: string): Promise<string> {
  return `${env.SITE_URL}/portal/${encodeURIComponent(orderNumber)}?t=${await portalToken(env, orderNumber)}`;
}
