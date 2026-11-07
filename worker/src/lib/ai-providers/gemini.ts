import { AIProviderError, type AIGenerateInput, type AIProvider } from './types';

/** Model the provider falls back to when the configured one was retired or misspelled (Google keeps this alias current). */
export const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest';

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

/**
 * "Thinking" Gemini models (2.5 and newer) spend output tokens on hidden reasoning before they write the
 * answer. With a small maxOutputTokens the answer comes back empty or cut off — the reason the connection
 * test (20 tokens) and the JSON suggestions used to fail. Thinking is switched off where the model allows
 * it, kept minimal where it doesn't, and older models get no thinking settings at all.
 */
export function thinkingConfig(model: string): Record<string, unknown> | undefined {
  const m = model.toLowerCase();
  if (/gemini-2\.5-pro/.test(m)) return { thinkingBudget: 128 }; // 2.5 Pro cannot turn thinking off
  if (/gemini-2\.5-flash/.test(m)) return { thinkingBudget: 0 };
  if (/gemini-[3-9]/.test(m) || /-latest$/.test(m)) return { thinkingBudget: 0 }; // newest models: keep thinking as low as allowed
  return undefined; // 1.x / 2.0 models do not think
}

/** Room for whatever thinking a model still does, on top of the tokens the caller asked for. */
const outputBudget = (model: string, asked: number) => asked + (thinkingConfig(model) ? 1024 : 0);

/** Short, safe reason from Google's error body (it never contains the key — the key travels in a header). */
function errorReason(status: number, body: GeminiResponse | null): string {
  const msg = (body?.error?.message || '').replace(/\s+/g, ' ').slice(0, 160);
  return `http_${status}${msg ? `: ${msg}` : ''}`;
}

/** Google Gemini (default content provider). Key: GEMINI_API_KEY secret. */
export function geminiProvider(apiKey: string | undefined, model: string): AIProvider {
  const call = async (input: AIGenerateInput, useModel: string, withThinking: boolean, budget: number) => {
    const thinking = withThinking ? thinkingConfig(useModel) : undefined;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(useModel)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: input.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: {
          maxOutputTokens: budget,
          temperature: input.temperature ?? 0.7,
          ...(input.json ? { responseMimeType: 'application/json' } : {}),
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      }),
    });
    const body = (await res.json().catch(() => null)) as GeminiResponse | null;
    if (!res.ok) return { error: errorReason(res.status, body), status: res.status, text: '', finish: '' };
    const cand = body?.candidates?.[0];
    const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    return { error: '', status: 200, text, finish: cand?.finishReason || body?.promptFeedback?.blockReason || '' };
  };

  return {
    id: 'gemini',
    label: 'জেমিনি',
    async generate(input: AIGenerateInput) {
      if (!apiKey) throw new AIProviderError('gemini', 'missing_key');
      let useModel = model;
      let withThinking = true;
      let budget = outputBudget(model, input.maxTokens ?? 1024);
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await call(input, useModel, withThinking, budget);
        if (r.text && r.finish !== 'MAX_TOKENS') return r.text;
        // Retired or misspelled model name → the current Flash model.
        if (r.status === 404 && useModel !== GEMINI_FALLBACK_MODEL) { useModel = GEMINI_FALLBACK_MODEL; budget = outputBudget(useModel, input.maxTokens ?? 1024); continue; }
        // A model that rejects the thinking settings → ask again without them.
        if (r.status === 400 && withThinking && /think/i.test(r.error)) { withThinking = false; continue; }
        // Ran out of room (thinking ate the budget, or a long JSON answer) → once more with plenty of room.
        if (r.status === 200 && r.finish === 'MAX_TOKENS' && budget < 8192) { budget = 8192; continue; }
        if (r.error) throw new AIProviderError('gemini', r.error);
        if (r.text) return r.text; // still cut off after the retry — return what there is
        throw new AIProviderError('gemini', r.finish ? `empty_response (${r.finish})` : 'empty_response');
      }
      throw new AIProviderError('gemini', 'empty_response');
    },
  };
}
