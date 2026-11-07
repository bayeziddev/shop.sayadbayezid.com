import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import loginFixture from '../fixtures/admin-login.json';

const BASE = 'http://localhost:8787';
const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const r = await SELF.fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
};
const sid = () => 'c' + crypto.randomUUID().replace(/-/g, '');

// In tests there is no AI key and no Workers AI binding — exactly the "AI is down" case: the visitor must still
// get the WhatsApp number and a way to leave theirs.
describe('chat assistant: contact details and lead capture', () => {
  it('always gives the WhatsApp number when asked for the developer’s number, and asks for the visitor’s', async () => {
    const r = await post('/api/chat/ai', { sessionId: sid(), message: 'ডেভেলপার এর নাম্বার দিন Whatsapp' });
    expect(r.status).toBe(200);
    expect(r.body.data.answer).toContain('01519601517');
    expect(r.body.data.answer).toContain('wa.me');
    expect(r.body.data.askLead).toBe(true);
    expect(r.body.data.whatsapp).toMatch(/^https:\/\/wa\.me\//);
  });

  it('saves a number typed in the chat as a lead at once (with the name), and never twice for one chat', async () => {
    const s = sid();
    const r = await post('/api/chat/ai', { sessionId: s, message: 'আমার নাম রহিম, নম্বর ০১৭১১-২২২৩৩৩ — গ্যাজেট শপ চাই' });
    expect(r.body.data.leadEventId).toMatch(/^ld_/);
    expect(r.body.data.askLead).toBe(false);
    expect(r.body.data.answer).toContain('নম্বর পেয়েছি'); // thanked, even with the AI down
    const lead = await env.DB.prepare(`SELECT l.name, l.phone, l.source, l.message FROM leads l JOIN chat_conversations c ON c.lead_id = l.id WHERE c.session_id = ?`).bind(s).first<any>();
    expect(lead).toMatchObject({ name: 'রহিম', phone: '8801711222333', source: 'chat' });
    expect(lead.message).toContain('গ্যাজেট শপ চাই');

    const again = await post('/api/chat/ai', { sessionId: s, message: 'আরেকটা নম্বর 01811222333' });
    expect(again.body.data.leadEventId).toBeNull();
    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE phone IN ('8801711222333', '8801811222333')`).first<{ n: number }>();
    expect(count?.n).toBe(1); // updated, not duplicated
  });

  it('does not mistake the business’s own number for a lead', async () => {
    const r = await post('/api/chat/ai', { sessionId: sid(), message: 'আপনাদের 01519601517 নম্বরে কল দিলে কে ধরবে?' });
    expect(r.body.data.leadEventId).toBeNull();
  });

  it('turns the name + number form into a lead, and completes the chat lead instead of duplicating it', async () => {
    const s = sid();
    await post('/api/chat/ai', { sessionId: s, message: 'দাম কত? 01911000111' });
    const h = await post('/api/chat/handoff', { sessionId: s, name: 'করিম', phone: '01911000111' });
    expect(h.status).toBe(200);
    expect(h.body.data.eventId).toBeNull(); // already a lead — the browser does not fire a second Lead
    const lead = await env.DB.prepare(`SELECT name FROM leads WHERE phone = '8801911000111'`).first<{ name: string }>();
    expect(lead?.name).toBe('করিম'); // "চ্যাট ভিজিটর" replaced by the real name

    const fresh = await post('/api/chat/handoff', { sessionId: sid(), name: 'সালমা', phone: '01611000222' });
    expect(fresh.body.data.eventId).toMatch(/^ld_/);
  });

  it('switches the chat to Gemini when it was still on the Workers AI default', async () => {
    const cfg = await env.DB.prepare(`SELECT provider FROM ai_provider_configs WHERE purpose = 'chat'`).first<{ provider: string }>();
    expect(cfg?.provider).toBe('gemini');
  });
});

describe('admin AI tools explain what is wrong', () => {
  it('reports a missing key in plain Bangla instead of a generic failure', async () => {
    await post('/api/admin/auth/setup', loginFixture.setup);
    const login = await SELF.fetch(BASE + '/api/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(loginFixture.login) });
    const h = { cookie: (login.headers.get('set-cookie') || '').split(';')[0], 'x-requested-with': 'admin', origin: BASE };
    const test = await post('/api/admin/ai/configs/content/test', {}, h);
    expect(test.body.data.ok).toBe(false);
    expect(test.body.data.detail).toContain('GEMINI_API_KEY');
    const sug = await post('/api/admin/ai/suggest', { name: 'পরীক্ষা প্যাকেজ', features: ['এক'] }, h);
    expect(sug.status).toBe(502);
    expect(JSON.stringify(sug.body)).toContain('এপিআই কী যোগ করা হয়নি');
  });
});
