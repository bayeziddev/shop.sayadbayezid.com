import type { Env } from '../env';
import { fail } from './http';

/**
 * Fixed-window rate limiter on KV. KV is eventually consistent, so limits are
 * approximate — adequate for slowing credential stuffing / checkout abuse.
 * For strict limits add a Cloudflare WAF rate-limiting rule on /api/admin/auth/* and /api/orders.
 */
export async function rateLimit(env: Env, bucket: string, key: string, limit: number, windowSec: number): Promise<void> {
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${bucket}:${key}:${window}`;
  const current = Number((await env.KV.get(k)) || '0');
  if (current >= limit) fail(429, 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', 'rate_limited');
  await env.KV.put(k, String(current + 1), { expirationTtl: Math.max(60, windowSec * 2) });
}
