import type { Env } from '../../env';
import { maskSecret } from '../util';
import { geminiProvider, type VertexRoute } from './gemini';
import { CLOUD_SCOPE, googleAccessToken, serviceAccount, vertexUrl } from '../google';
import { openaiProvider } from './openai';
import { workersAiProvider } from './workers-ai';
import type { AIGenerateInput, AIProvider } from './types';

export * from './types';

export interface AIConfigRow {
  id: number;
  purpose: 'content' | 'chat';
  provider: 'gemini' | 'workers_ai' | 'openai';
  model: string;
  secret_name: string;
  key_hint: string;
  system_prompt: string;
  tone: string;
  last_test_at: string | null;
  last_test_ok: number | null;
}

/** Which Wrangler secret each provider reads. The admin UI can only choose among these. */
export const PROVIDER_SECRETS: Record<AIConfigRow['provider'], keyof Env | ''> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  workers_ai: '',
};

export const PROVIDER_DEFAULT_MODELS: Record<AIConfigRow['provider'], string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  workers_ai: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};

export async function getAIConfig(env: Env, purpose: 'content' | 'chat'): Promise<AIConfigRow | null> {
  return env.DB.prepare('SELECT * FROM ai_provider_configs WHERE purpose = ?').bind(purpose).first<AIConfigRow>();
}

/** Gemini through Vertex AI with the Google service account, when one with a project id is configured. */
function vertexRoute(env: Env): VertexRoute | undefined {
  const sa = serviceAccount(env);
  if (!sa?.project_id) return undefined;
  return { url: (model) => vertexUrl(sa, model), token: () => googleAccessToken(env, CLOUD_SCOPE) };
}

export function buildProvider(env: Env, cfg: Pick<AIConfigRow, 'provider' | 'model'>, opts: { forceVertex?: boolean } = {}): AIProvider {
  switch (cfg.provider) {
    case 'gemini':
      return geminiProvider(env.GEMINI_API_KEY, cfg.model || PROVIDER_DEFAULT_MODELS.gemini, vertexRoute(env), opts);
    case 'openai':
      return openaiProvider(env.OPENAI_API_KEY, cfg.model || PROVIDER_DEFAULT_MODELS.openai);
    case 'workers_ai':
      return workersAiProvider(env.AI, cfg.model || PROVIDER_DEFAULT_MODELS.workers_ai);
  }
}

/**
 * Generate with the configured provider; if it fails and Cloudflare Workers AI is available, answer with that
 * instead (used by the visitor chat, which must never go silent because of a key, quota or model problem).
 */
export async function generateWithFallback(env: Env, cfg: Pick<AIConfigRow, 'provider' | 'model'>, input: AIGenerateInput): Promise<{ text: string; provider: AIConfigRow['provider']; error?: string }> {
  try {
    return { text: await buildProvider(env, cfg).generate(input), provider: cfg.provider };
  } catch (e) {
    if (cfg.provider === 'workers_ai' || !env.AI) throw e;
    const text = await buildProvider(env, { provider: 'workers_ai', model: '' }).generate(input);
    return { text, provider: 'workers_ai', error: String((e as Error).message) };
  }
}

/** The JSON object in a model's answer, even when it is wrapped in ``` fences or a sentence. */
export function parseAiJson(raw: string): Record<string, unknown> {
  const t = raw.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('empty_response (no JSON)');
  const v = JSON.parse(t.slice(start, end + 1)) as unknown;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('empty_response (no JSON)');
  return v as Record<string, unknown>;
}

/** What went wrong, in plain Bangla for the admin (raw detail kept in brackets; keys never appear in it). */
export function aiErrorBn(e: unknown): string {
  const raw = String((e as Error)?.message || e).replace(/key=[^&\s]+/g, 'key=•••').slice(0, 220);
  const m = raw.toLowerCase();
  let why = 'এআই থেকে উত্তর পাওয়া যায়নি';
  if (m.includes('missing_key')) why = 'এপিআই কী যোগ করা হয়নি — GitHub সিক্রেটে GEMINI_API_KEY (বা OPENAI_API_KEY) দিয়ে ডিপ্লয় আবার চালান';
  else if (/api key not valid|api_key_invalid|http_401/.test(m)) why = 'এপিআই কী সঠিক নয় — Google AI Studio থেকে নতুন কী নিয়ে GitHub সিক্রেট বদলান';
  else if (m.includes('http_403')) why = 'এই কী দিয়ে অনুমতি নেই — Google AI Studio-তে কী-টি সক্রিয় ও Generative Language API চালু আছে কি না দেখুন';
  else if (m.includes('http_404')) why = 'মডেলের নাম পাওয়া যায়নি — মডেল ঘরে gemini-flash-latest বা gemini-2.5-flash লিখুন';
  else if (m.includes('http_429')) why = 'কোটা শেষ বা খুব দ্রুত অনুরোধ — কিছুক্ষণ পর আবার চেষ্টা করুন (ফ্রি কোটায় মিনিটে সীমা থাকে)';
  else if (m.includes('http_400')) why = 'অনুরোধটি গ্রহণ করা হয়নি';
  else if (/http_5\d\d/.test(m)) why = 'এআই সার্ভারে সাময়িক সমস্যা — একটু পরে আবার চেষ্টা করুন';
  else if (m.includes('empty_response')) why = 'এআই খালি উত্তর দিয়েছে — আবার চেষ্টা করুন';
  else if (m.includes('not configured') || m.includes('binding')) why = 'এআই সংযোগ কনফিগার করা নেই';
  return `${why} (${raw})`;
}

/** Masked key status for the admin UI — the key itself never leaves the Worker. */
export function keyStatus(env: Env, provider: AIConfigRow['provider']): { configured: boolean; hint: string } {
  const name = PROVIDER_SECRETS[provider];
  if (!name) return { configured: !!env.AI, hint: env.AI ? 'বাইন্ডিং সংযুক্ত' : '' };
  const v = env[name] as string | undefined;
  if (!v && provider === 'gemini' && serviceAccount(env)?.project_id) return { configured: true, hint: 'সার্ভিস অ্যাকাউন্ট (Vertex AI)' };
  return { configured: !!v, hint: maskSecret(v) };
}
