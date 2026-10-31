import { AIProviderError, type AIGenerateInput, type AIProvider } from './types';

/** Cloudflare Workers AI via the AI binding (no external key). */
export function workersAiProvider(ai: Ai | undefined, model: string): AIProvider {
  return {
    id: 'workers_ai',
    label: 'ক্লাউডফ্লেয়ার ওয়ার্কার্স এআই',
    async generate(input: AIGenerateInput) {
      if (!ai) throw new AIProviderError('workers_ai', 'binding_missing');
      const out = (await ai.run(model as Parameters<Ai['run']>[0], {
        messages: [{ role: 'system', content: input.system }, ...input.messages],
        max_tokens: input.maxTokens ?? 800,
        temperature: input.temperature ?? 0.5,
      } as never)) as { response?: string } | string;
      const text = typeof out === 'string' ? out : out?.response || '';
      if (!text) throw new AIProviderError('workers_ai', 'empty_response');
      return text;
    },
  };
}
