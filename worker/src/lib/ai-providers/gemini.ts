import { AIProviderError, type AIGenerateInput, type AIProvider } from './types';

/** Google Gemini (default content provider). Key: GEMINI_API_KEY secret. */
export function geminiProvider(apiKey: string | undefined, model: string): AIProvider {
  return {
    id: 'gemini',
    label: 'জেমিনি',
    async generate(input: AIGenerateInput) {
      if (!apiKey) throw new AIProviderError('gemini', 'missing_key');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: input.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: {
            maxOutputTokens: input.maxTokens ?? 1024,
            temperature: input.temperature ?? 0.7,
            ...(input.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      });
      if (!res.ok) throw new AIProviderError('gemini', `http_${res.status}`);
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!text) throw new AIProviderError('gemini', 'empty_response');
      return text;
    },
  };
}
