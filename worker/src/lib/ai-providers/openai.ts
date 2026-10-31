import { AIProviderError, type AIGenerateInput, type AIProvider } from './types';

/** OpenAI-compatible chat completions. Key: OPENAI_API_KEY secret. */
export function openaiProvider(apiKey: string | undefined, model: string): AIProvider {
  return {
    id: 'openai',
    label: 'ওপেনএআই',
    async generate(input: AIGenerateInput) {
      if (!apiKey) throw new AIProviderError('openai', 'missing_key');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: input.maxTokens ?? 1024,
          temperature: input.temperature ?? 0.7,
          messages: [{ role: 'system', content: input.system }, ...input.messages],
          ...(input.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (!res.ok) throw new AIProviderError('openai', `http_${res.status}`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = j.choices?.[0]?.message?.content || '';
      if (!text) throw new AIProviderError('openai', 'empty_response');
      return text;
    },
  };
}
