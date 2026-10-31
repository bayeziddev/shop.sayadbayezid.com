import { b64ToBytes, bytesToB64, safeEqual } from './util';

/**
 * Password hashing: PBKDF2-SHA256, 100k iterations (the Workers runtime maximum), 16-byte salt.
 * Format: pbkdf2$<iterations>$<saltB64>$<hashB64>
 */
const ITER = 100_000;

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(password, salt, ITER);
  return `pbkdf2$${ITER}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iter, saltB64, hashB64] = stored.split('$');
  if (alg !== 'pbkdf2' || !iter || !saltB64 || !hashB64) return false;
  const hash = await pbkdf2(password, b64ToBytes(saltB64), Number(iter));
  return safeEqual(bytesToB64(hash), hashB64);
}

/** AES-256-GCM field encryption for client-submitted project requirements. */
async function dataKey(secretB64: string | undefined): Promise<CryptoKey> {
  if (!secretB64) throw new Error('DATA_ENCRYPTION_KEY secret is not configured');
  const raw = b64ToBytes(secretB64);
  if (raw.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (base64)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptJson(secretB64: string | undefined, value: unknown): Promise<{ payload: string; iv: string }> {
  const key = await dataKey(secretB64);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { payload: bytesToB64(new Uint8Array(ct)), iv: bytesToB64(iv) };
}

export async function decryptJson<T>(secretB64: string | undefined, payload: string, iv: string): Promise<T> {
  const key = await dataKey(secretB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(iv) }, key, b64ToBytes(payload));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
