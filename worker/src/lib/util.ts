/** Small shared helpers. */

export const nowIso = () => new Date().toISOString();

export function randomToken(bytes = 24): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a);
}

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of a) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function bytesToB64(a: Uint8Array): string {
  let s = '';
  for (const x of a) s += String.fromCharCode(x);
  return btoa(s);
}

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Normalise a Bangladeshi mobile number to 8801XXXXXXXXX. Returns '' if invalid. */
export function normalizeBdPhone(raw: string): string {
  const bnDigits = '০১২৩৪৫৬৭৮৯';
  let s = (raw || '').replace(/[০-৯]/g, (d) => String(bnDigits.indexOf(d))).replace(/[^\d+]/g, '');
  s = s.replace(/^\+/, '');
  if (s.startsWith('00')) s = s.slice(2);
  if (/^01[3-9]\d{8}$/.test(s)) return '88' + s;
  if (/^8801[3-9]\d{8}$/.test(s)) return s;
  if (/^\d{8,15}$/.test(s) && !s.startsWith('0')) return s; // international
  return '';
}

export function isEmail(s: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ঀ-৿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const BN = '০১২৩৪৫৬৭৮৯';
export const bnDigits = (v: string | number) => String(v).replace(/\d/g, (d) => BN[Number(d)]);
export const taka = (n: number) => '৳' + new Intl.NumberFormat('bn-BD').format(Math.round(n || 0));

export function bnDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('bn-BD', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  }).format(d);
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
}

export function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function toInt(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

export function maskSecret(v: string | undefined): string {
  if (!v) return '';
  return '••••••••' + v.slice(-4);
}
