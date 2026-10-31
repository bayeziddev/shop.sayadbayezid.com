import { Hono } from 'hono';
import type { AppBindings } from '../env';
import { fail, ok, readJson } from '../lib/http';
import { getSettings } from '../lib/settings';
import { loadPublicPackages, type CategoryRow } from '../lib/catalog';
import { rateLimit } from '../lib/ratelimit';
import { clampStr, clientIp, isEmail, normalizeBdPhone, randomToken, toInt, parseJson, nowIso, taka } from '../lib/util';
import { readAttribution } from '../lib/attribution';
import { sendMetaEvent } from '../lib/meta-capi';
import { notifyAdmins } from '../lib/audit';
import { whatsappLink, messengerLink } from '../lib/contact-links';
import { buildProvider, getAIConfig } from '../lib/ai-providers';
import { isOfferLive } from '../../../shared/pricing';

export const publicApi = new Hono<AppBindings>();

publicApi.get('/api/categories', async (c) => {
  const r = await c.env.DB.prepare('SELECT id, slug, name, description, icon FROM categories WHERE is_active = 1 ORDER BY sort_order, id').all<CategoryRow>();
  return ok(c, r.results);
});

publicApi.get('/api/packages', async (c) => {
  const cat = c.req.query('category');
  const ids = (c.req.query('ids') || '').split(',').map(Number).filter((n) => n > 0);
  let list = await loadPublicPackages(c.env);
  if (cat) list = list.filter((p) => p.categorySlug === cat);
  if (ids.length) list = list.filter((p) => ids.includes(p.id));
  c.header('cache-control', 'public, max-age=30');
  return ok(c, list);
});

publicApi.get('/api/packages/:slug', async (c) => {
  const [p] = await loadPublicPackages(c.env, { slug: c.req.param('slug') });
  if (!p) fail(404, 'প্যাকেজ পাওয়া যায়নি');
  return ok(c, p);
});

/* ---------------- Leads ---------------- */
publicApi.post('/api/leads', async (c) => {
  const ip = clientIp(c.req.raw);
  await rateLimit(c.env, 'lead', ip, 8, 600);
  const b = await readJson<Record<string, unknown>>(c);
  if (clampStr(b.website, 10)) return ok(c, { eventId: null }); // honeypot
  const source = (['quote', 'chat', 'quiz', 'landing', 'contact'] as const).find((s) => s === b.source) || 'contact';
  const name = clampStr(b.name, 100);
  const phone = normalizeBdPhone(clampStr(b.phone, 30));
  const email = clampStr(b.email, 200).toLowerCase();
  if (name.length < 2) fail(422, 'আপনার নাম লিখুন', 'name');
  if (!phone) fail(422, 'সঠিক মোবাইল নম্বর দিন', 'phone');
  if (email && !isEmail(email)) fail(422, 'ইমেইল ঠিকানাটি সঠিক নয়', 'email');
  if (source === 'quote' && clampStr(b.message, 3000).length < 5) fail(422, 'আপনার চাহিদা সংক্ষেপে লিখুন', 'message');
  const attr = readAttribution(b.attribution, c.req.header('cookie') || '');
  const eventId = `ld_${randomToken(12)}`;
  const s = await getSettings(c.env);
  const r = await c.env.DB.prepare(
    `INSERT INTO leads (source, name, phone, email, business_name, message, package_id, quiz_result, lead_event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, landing_page_id, source_url, next_follow_up_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(
    source, name, phone, email, clampStr(b.business_name, 150), clampStr(b.message, 3000), toInt(b.packageId) || null,
    b.quiz ? JSON.stringify(b.quiz).slice(0, 2000) : null, eventId,
    attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_content, attr.utm_term, attr.fbclid, toInt(b.landing_page_id) || attr.landing_page_id, attr.source_url,
    new Date(Date.now() + s.lead_followup_hours * 3600_000).toISOString(),
  ).first<{ id: number }>();
  const label = { quote: 'কোটেশন অনুরোধ', chat: 'চ্যাট', quiz: 'কুইজ', landing: 'ল্যান্ডিং পেজ', contact: 'যোগাযোগ ফর্ম' }[source];
  c.executionCtx.waitUntil(Promise.all([
    notifyAdmins(c.env, 'new_lead', `নতুন লিড (${label}): ${name}`, `#/leads/${r!.id}`),
    sendMetaEvent(c.env, s.meta_pixel_id, {
      name: 'Lead', eventId, sourceUrl: attr.source_url || c.env.SITE_URL,
      user: { email, phone, firstName: name, ip, userAgent: c.req.header('user-agent'), fbp: attr.fbp, fbc: attr.fbc, externalId: phone },
      customData: { lead_source: source, content_ids: b.packageId ? [String(b.packageId)] : [] },
    }),
  ]).catch((e) => console.error(e)));
  return ok(c, { eventId, leadId: r!.id }, 201);
});

/* ---------------- Tracking beacon (PageView / ViewContent mirror) ---------------- */
publicApi.post('/api/track', async (c) => {
  await rateLimit(c.env, 'track', clientIp(c.req.raw), 120, 60);
  const b = await readJson<{ event?: string; eventId?: string; url?: string; customData?: Record<string, unknown>; fbp?: string; fbc?: string }>(c);
  // Only browsing events can be mirrored this way. Lead / InitiateCheckout / Purchase are fired by the server
  // itself at the moment they are confirmed, so they can never be triggered from the browser.
  if (b.event !== 'PageView' && b.event !== 'ViewContent') fail(422, 'অননুমোদিত ইভেন্ট');
  const eventId = clampStr(b.eventId, 64);
  if (!/^[\w-]{8,64}$/.test(eventId)) fail(422, 'ইভেন্ট আইডি সঠিক নয়');
  const url = clampStr(b.url, 1000);
  if (!url.startsWith(c.env.SITE_URL)) return ok(c, { sent: false });
  const s = await getSettings(c.env);
  const cd = (b.customData && typeof b.customData === 'object' ? b.customData : {}) as Record<string, unknown>;
  const custom = b.event === 'ViewContent' ? { content_ids: Array.isArray(cd.content_ids) ? cd.content_ids.slice(0, 5).map(String) : [], content_type: 'product', value: toInt(cd.value), currency: 'BDT' } : {};
  c.executionCtx.waitUntil(sendMetaEvent(c.env, s.meta_pixel_id, {
    name: b.event, eventId, sourceUrl: url,
    user: { ip: clientIp(c.req.raw), userAgent: c.req.header('user-agent'), fbp: clampStr(b.fbp, 200), fbc: clampStr(b.fbc, 600) },
    customData: custom,
  }).catch(() => {}));
  return ok(c, { accepted: true });
});

/* ---------------- Chat ---------------- */
interface ChatSettingsRow { ai_enabled: number; whatsapp_enabled: number; whatsapp_number: string; whatsapp_message: string; messenger_enabled: number; messenger_page: string; greeting: string; knowledge: string; escalation_message: string }

const chatSettings = (c: { env: AppBindings['Bindings'] }) => c.env.DB.prepare('SELECT * FROM chat_settings WHERE id = 1').first<ChatSettingsRow>();

publicApi.get('/api/chat/config', async (c) => {
  const cs = await chatSettings(c);
  c.header('cache-control', 'public, max-age=60');
  return ok(c, {
    ai: !!cs?.ai_enabled,
    whatsapp: cs?.whatsapp_enabled ? whatsappLink(cs.whatsapp_number, cs.whatsapp_message) || null : null,
    messenger: cs?.messenger_enabled ? messengerLink(cs.messenger_page) || null : null,
    greeting: cs?.greeting || '',
  });
});

async function buildKnowledge(c: { env: AppBindings['Bindings'] }, extra: string): Promise<string> {
  const now = Date.now();
  const pkgs = await loadPublicPackages(c.env);
  const faqs = (await c.env.DB.prepare('SELECT question, answer FROM faqs WHERE is_active = 1 ORDER BY sort_order LIMIT 40').all<{ question: string; answer: string }>()).results;
  const s = await getSettings(c.env);
  const pk = pkgs.map((p) => {
    const offer = p.offers.find((o) => isOfferLive(o, now));
    return `- ${p.name} (${p.categoryName}): মূল দাম ${taka(p.basePrice)}${offer ? `, চলমান অফার: ${offer.discountType === 'percent' ? offer.discountValue + '%' : taka(offer.discountValue)} ছাড়` : ''}${p.status === 'coming_soon' ? ' [শীঘ্রই আসছে]' : ''}; ডেলিভারি ${p.deliveryDays} কর্মদিবস; ফিচার: ${p.features.join(', ')}; অ্যাড-অন: ${p.addons.map((a) => `${a.name} +${taka(a.priceDelta)}`).join(', ')}; লিংক: ${c.env.SITE_URL}/package/${p.slug}`;
  }).join('\n');
  return [
    `প্রতিষ্ঠান: ${s.brand_name}। যোগাযোগ: ${s.contact_phone} ${s.contact_email}। সময়: ${s.business_hours}`,
    'কাজের ধাপ: প্যাকেজ বাছাই → অনলাইনে পেমেন্ট (বিকাশ/নগদ/রকেট/কার্ড/ব্যাংক) → তথ্য জমা → ডেভেলপমেন্ট → ক্লায়েন্ট রিভিউ → সংশোধন → ডেলিভারি। পেমেন্ট নিশ্চিত হওয়ার আগে কাজ শুরু হয় না।',
    `প্যাকেজসমূহ:\n${pk}`,
    `প্রশ্নোত্তর:\n${faqs.map((f) => `প্রশ্ন: ${f.question}\nউত্তর: ${f.answer}`).join('\n')}`,
    extra ? `অতিরিক্ত তথ্য:\n${extra}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 24000);
}

const ESCALATE = '[ESCALATE]';

publicApi.post('/api/chat/ai', async (c) => {
  await rateLimit(c.env, 'chat', clientIp(c.req.raw), 30, 600);
  const b = await readJson<{ sessionId?: string; message?: string }>(c);
  const sessionId = clampStr(b.sessionId, 64);
  const message = clampStr(b.message, 600);
  if (!/^[\w-]{10,64}$/.test(sessionId) || !message) fail(422, 'বার্তা সঠিক নয়');
  const cs = await chatSettings(c);
  if (!cs?.ai_enabled) fail(503, 'এআই সাপোর্ট এখন বন্ধ আছে');

  let conv = await c.env.DB.prepare('SELECT * FROM chat_conversations WHERE session_id = ?').bind(sessionId).first<{ id: number; status: string; transcript: string }>();
  if (!conv) {
    conv = await c.env.DB.prepare('INSERT INTO chat_conversations (session_id) VALUES (?) RETURNING id, status, transcript').bind(sessionId).first();
  }
  const transcript = parseJson<{ role: 'user' | 'assistant'; content: string; at: string }[]>(conv!.transcript, []).slice(-20);
  transcript.push({ role: 'user', content: message, at: nowIso() });

  let answer = '';
  let escalate = false;
  try {
    const cfg = await getAIConfig(c.env, 'chat');
    if (!cfg) throw new Error('no_chat_config');
    const provider = buildProvider(c.env, cfg);
    const system = `${cfg.system_prompt}\nলেখার ধরন: ${cfg.tone}\n\nনিয়ম:\n১. শুধু নিচের তথ্য থেকে উত্তর দাও, সবসময় বাংলায়, সংক্ষেপে।\n২. দাম, সময় বা ফিচার নিয়ে নিশ্চিত না হলে বা তথ্যে না থাকলে, অথবা ক্রেতা মানুষের সাথে কথা বলতে চাইলে, উত্তরের শুরুতে হুবহু ${ESCALATE} লিখবে।\n৩. কোনো ছাড় বা প্রতিশ্রুতি নিজে থেকে বানাবে না।\n\n${await buildKnowledge(c, cs.knowledge)}`;
    answer = (await provider.generate({ system, messages: transcript.map(({ role, content }) => ({ role, content })), maxTokens: 500, temperature: 0.3 })).trim();
    if (answer.includes(ESCALATE)) {
      escalate = true;
      answer = answer.replace(ESCALATE, '').trim();
    }
  } catch (e) {
    console.error('chat ai failed', e);
    escalate = true;
  }
  if (escalate) answer = [answer, cs.escalation_message].filter(Boolean).join('\n\n');
  transcript.push({ role: 'assistant', content: answer, at: nowIso() });
  await c.env.DB.prepare('UPDATE chat_conversations SET transcript = ?, status = CASE WHEN ? THEN \'escalated\' ELSE status END, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(transcript.slice(-30)), escalate ? 1 : 0, nowIso(), conv!.id).run();
  if (escalate && conv!.status !== 'escalated') await notifyAdmins(c.env, 'chat_escalated', 'একটি চ্যাট মানুষের সহায়তা চাইছে', '#/chats');
  return ok(c, { answer, escalate });
});

/** Visitor leaves name + phone after an escalation → becomes a lead. */
publicApi.post('/api/chat/handoff', async (c) => {
  await rateLimit(c.env, 'handoff', clientIp(c.req.raw), 5, 600);
  const b = await readJson<{ sessionId?: string; name?: string; phone?: string; attribution?: unknown }>(c);
  const sessionId = clampStr(b.sessionId, 64);
  const name = clampStr(b.name, 100);
  const phone = normalizeBdPhone(clampStr(b.phone, 30));
  if (!name || !phone) fail(422, 'নাম ও সঠিক মোবাইল নম্বর দিন');
  const conv = await c.env.DB.prepare('SELECT * FROM chat_conversations WHERE session_id = ?').bind(sessionId).first<{ id: number; transcript: string; lead_id: number | null }>();
  const summary = parseJson<{ role: string; content: string }[]>(conv?.transcript, []).filter((m) => m.role === 'user').map((m) => `• ${m.content}`).join('\n').slice(0, 2500);
  const attr = readAttribution(b.attribution, c.req.header('cookie') || '');
  const eventId = `ld_${randomToken(12)}`;
  const lead = await c.env.DB.prepare(
    `INSERT INTO leads (source, name, phone, message, lead_event_id, utm_source, utm_medium, utm_campaign, utm_content, fbclid, landing_page_id, source_url) VALUES ('chat', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(name, phone, summary, eventId, attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_content, attr.fbclid, attr.landing_page_id, attr.source_url).first<{ id: number }>();
  if (conv) await c.env.DB.prepare("UPDATE chat_conversations SET visitor_name = ?, visitor_phone = ?, lead_id = ?, status = 'escalated', updated_at = ? WHERE id = ?").bind(name, phone, lead!.id, nowIso(), conv.id).run();
  const s = await getSettings(c.env);
  c.executionCtx.waitUntil(Promise.all([
    notifyAdmins(c.env, 'chat_escalated', `চ্যাট থেকে যোগাযোগের অনুরোধ: ${name}`, `#/leads/${lead!.id}`),
    sendMetaEvent(c.env, s.meta_pixel_id, { name: 'Lead', eventId, sourceUrl: attr.source_url || c.env.SITE_URL, user: { phone, firstName: name, ip: clientIp(c.req.raw), userAgent: c.req.header('user-agent'), fbp: attr.fbp, fbc: attr.fbc, externalId: phone }, customData: { lead_source: 'chat' } }),
  ]).catch(() => {}));
  return ok(c, { eventId });
});
