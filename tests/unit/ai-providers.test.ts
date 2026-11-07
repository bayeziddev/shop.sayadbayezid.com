import { afterEach, describe, expect, it, vi } from 'vitest';
import { geminiProvider, thinkingConfig, GEMINI_FALLBACK_MODEL } from '../../worker/src/lib/ai-providers/gemini';
import { aiErrorBn, parseAiJson } from '../../worker/src/lib/ai-providers/index';
import { nameInText, phoneInText, plainChatText } from '../../worker/src/lib/contact-links';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (text: string, finishReason = 'STOP') => reply(200, { candidates: [{ content: { parts: [{ text }] }, finishReason }] });
const input = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 20 };

afterEach(() => vi.unstubAllGlobals());

describe('Gemini provider', () => {
  it('turns thinking off for 2.5 Flash and leaves room for the answer (the old 20-token test came back empty)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('ঠিক আছে'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await geminiProvider('k', 'gemini-2.5-flash').generate(input)).toBe('ঠিক আছে');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThan(1000);
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('k'); // key in a header, never in the URL
    expect(fetchMock.mock.calls[0][0]).not.toContain('key=');
  });

  it('sends no thinking settings to models that do not think', () => {
    expect(thinkingConfig('gemini-2.0-flash')).toBeUndefined();
    expect(thinkingConfig('gemini-2.5-pro')).toEqual({ thinkingBudget: 128 });
  });

  it('moves to the current Flash model when the configured model is gone', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(404, { error: { code: 404, message: 'models/gemini-1.0-pro is not found' } }))
      .mockResolvedValueOnce(ok('হ্যাঁ'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await geminiProvider('k', 'gemini-1.0-pro').generate(input)).toBe('হ্যাঁ');
    expect(fetchMock.mock.calls[1][0]).toContain(GEMINI_FALLBACK_MODEL);
  });

  it('asks again with more room when the answer was cut off, and retries without thinking if a model rejects it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(400, { error: { message: 'Thinking budget is not supported for this model' } }))
      .mockResolvedValueOnce(ok('{"title":', 'MAX_TOKENS'))
      .mockResolvedValueOnce(ok('{"title":"ক"}'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await geminiProvider('k', 'gemini-3-pro').generate({ ...input, json: true })).toBe('{"title":"ক"}');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).generationConfig.thinkingConfig).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).generationConfig.maxOutputTokens).toBe(8192);
  });

  it('reports Google’s own reason, in Bangla for the admin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } })));
    const err = await geminiProvider('bad', 'gemini-2.5-flash').generate(input).catch((e) => e);
    expect(aiErrorBn(err)).toContain('এপিআই কী সঠিক নয়');
    expect(aiErrorBn(new Error('gemini: http_429: quota'))).toContain('কোটা');
    expect(aiErrorBn(new Error('gemini: missing_key'))).toContain('GEMINI_API_KEY');
  });

  it('reads the JSON object even when wrapped in fences or a sentence', () => {
    expect(parseAiJson('```json\n{"title":"ক"}\n```')).toEqual({ title: 'ক' });
    expect(parseAiJson('এই নিন: {"title":"খ"} ধন্যবাদ')).toEqual({ title: 'খ' });
    expect(() => parseAiJson('কিছু নেই')).toThrow();
  });
});

describe('reading a number and a name from a chat message', () => {
  it('finds Bangla or Latin digits, with spaces, dashes or +88', () => {
    expect(phoneInText('আমার নম্বর ০১৭১১-২২২৩৩৩')).toBe('8801711222333');
    expect(phoneInText('call me +88 01811 222 333 pls')).toBe('8801811222333');
    expect(phoneInText('দাম কত? ১২০০০ টাকা')).toBe('');
    expect(phoneInText('01519601517', ['8801519601517'])).toBe(''); // the business's own number
  });
  it('picks up a stated name', () => {
    expect(nameInText('আমার নাম রহিম, নম্বর ০১৭১১২২২৩৩৩')).toBe('রহিম');
    expect(nameInText('My name is Karim 01711222333')).toBe('Karim');
    expect(nameInText('দাম কত?')).toBe('');
  });
});

describe('chat answers are plain text', () => {
  it('drops the Markdown Gemini adds, keeping the number and the link', () => {
    const live = 'হোয়াটসঅ্যাপ নম্বর হলো: **01519601517**। \n\n\n* লিংক: [এখানে](https://wa.me/message/TDYG575YENF6F1)\n## শেষ';
    expect(plainChatText(live)).toBe('হোয়াটসঅ্যাপ নম্বর হলো: 01519601517।\n\n• লিংক: এখানে: https://wa.me/message/TDYG575YENF6F1\nশেষ');
  });
});
