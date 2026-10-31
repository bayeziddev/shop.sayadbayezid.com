import type { Env } from '../../env';
import { maskSecret } from '../util';
import { geminiProvider } from './gemini';
import { openaiProvider } from './openai';
import { workersAiProvider } from './workers-ai';
import type { AIProvider } from './types';

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

export function buildProvider(env: Env, cfg: Pick<AIConfigRow, 'provider' | 'model'>): AIProvider {
  switch (cfg.provider) {
    case 'gemini':
      return geminiProvider(env.GEMINI_API_KEY, cfg.model || PROVIDER_DEFAULT_MODELS.gemini);
    case 'openai':
      return openaiProvider(env.OPENAI_API_KEY, cfg.model || PROVIDER_DEFAULT_MODELS.openai);
    case 'workers_ai':
      return workersAiProvider(env.AI, cfg.model || PROVIDER_DEFAULT_MODELS.workers_ai);
  }
}

/** Masked key status for the admin UI — the key itself never leaves the Worker. */
export function keyStatus(env: Env, provider: AIConfigRow['provider']): { configured: boolean; hint: string } {
  const name = PROVIDER_SECRETS[provider];
  if (!name) return { configured: !!env.AI, hint: env.AI ? 'বাইন্ডিং সংযুক্ত' : '' };
  const v = env[name] as string | undefined;
  return { configured: !!v, hint: maskSecret(v) };
}
