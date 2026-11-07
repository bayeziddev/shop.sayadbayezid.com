import { Hono, type Context } from 'hono';
import type { AppBindings } from '../env';
import { fail, ok, readJson } from '../lib/http';
import { getSettings } from '../lib/settings';
import { loadPublicPackages, type CategoryRow } from '../lib/catalog';
import { rateLimit } from '../lib/ratelimit';
import { clampStr, clientIp, isEmail, normalizeBdPhone, randomToken, toInt, parseJson, nowIso, taka, publicOrigin } from '../lib/util';
import { readAttribution } from '../lib/attribution';
import { sendMetaEvent } from '../lib/meta-capi';
import { notifyAdmins } from '../lib/audit';
import { alertNewLead } from '../lib/notify';
import { whatsappLink, messengerLink, phoneInText, nameInText, plainChatText } from '../lib/contact-links';
import { generateWithFallback, getAIConfig } from '../lib/ai-providers';
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
/** Lead box answers we accept (anything else is dropped) and their Bangla labels for the team. */
const LEADBOX_FIELDS: Record<string, string> = {
  site_type: 'ওয়েবসাইটের ধরন', category: 'ব্যবসার ধরন', product: 'পণ্য/সেবা', stage: 'ব্যবসার অবস্থা', timeline: 'কবে চালু করতে চান', demo: 'পছন্দের ডেমো',
};
const SOURCE_BN = { quote: 'কোটেশন অনুরোধ', chat: 'চ্যাট', quiz: 'কুইজ', landing: 'ল্যান্ডিং পেজ', contact: 'যোগাযোগ ফর্ম', leadbox: 'লিড বক্স' } as const;

publicApi.post('/api/leads', async (c) => {
  const ip = clientIp(c.req.raw);
  await rateLimit(c.env, 'lead', ip, 8, 600);
  const b = await readJson<Record<string, unknown>>(c);
  if (clampStr(b.website, 10)) return ok(c, { eventId: null }); // honeypot
  const source = (['quote', 'chat', 'quiz', 'landing', 'contact', 'leadbox'] as const).find((s) => s === b.source) || 'contact';
  const name = clampStr(b.name, 100);
  const phone = normalizeBdPhone(clampStr(b.phone, 30));
  const email = clampStr(b.email, 200).toLowerCase();
  if (name.length < 2) fail(422, 'আপনার নাম লিখুন', 'name');
  if (!phone) fail(422, source === 'leadbox' ? 'সঠিক হোয়াটসঅ্যাপ নম্বর দিন (০১XXXXXXXXX)' : 'সঠিক মোবাইল নম্বর দিন', 'phone');
  if (email && !isEmail(email)) fail(422, 'ইমেইল ঠিকানাটি সঠিক নয়', 'email');
  if (source === 'quote' && clampStr(b.message, 3000).length < 5) fail(422, 'আপনার চাহিদা সংক্ষেপে লিখুন', 'message');
  const attr = readAttribution(b.attribution, c.req.header('cookie') || '');
  const eventId = `ld_${randomToken(12)}`;
  const s = await getSettings(c.env);

  // Lead box: step answers (whitelisted), and the demo the visitor picked becomes the lead's package.
  const raw = (b.answers && typeof b.answers === 'object' ? b.answers : {}) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const k of Object.keys(LEADBOX_FIELDS)) { const v = clampStr(raw[k], 120); if (v) answers[k] = v; }
  let packageId = toInt(b.packageId) || null;
  let demoName = '';
  if (answers.demo) {
    const p = await c.env.DB.prepare(`SELECT id, name FROM packages WHERE slug = ? AND status IN ('active','coming_soon')`).bind(answers.demo).first<{ id: number; name: string }>();
    if (p) { packageId = p.id; demoName = p.name; }
  }
  const answerPairs: [string, string][] = Object.entries(answers).map(([k, v]) => [LEADBOX_FIELDS[k], k === 'demo' ? demoName || v : v]);
  const message = clampStr(b.message, 3000) || answerPairs.map(([k, v]) => `${k}: ${v}`).join('\n');
  const quiz = Object.keys(answers).length ? answers : b.quiz || null;
  const pageUrl = clampStr(b.page_url, 1000);

  const r = await c.env.DB.prepare(
    `INSERT INTO leads (source, name, phone, email, business_name, message, package_id, quiz_result, lead_event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, landing_page_id, source_url, next_follow_up_at, is_internal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(
    source, name, phone, email, clampStr(b.business_name, 150), message, packageId,
    quiz ? JSON.stringify(quiz).slice(0, 2000) : null, eventId,
    attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_content, attr.utm_term, attr.fbclid, toInt(b.landing_page_id) || attr.landing_page_id, attr.source_url || pageUrl,
    new Date(Date.now() + s.lead_followup_hours * 3600_000).toISOString(), attr.internal ? 1 : 0,
  ).first<{ id: number }>();
  const leadId = r!.id;
  const label = SOURCE_BN[source];
  const adminUrl = `${c.env.SITE_URL.replace(/\/$/, '')}/admin/#/leads/${leadId}`;
  c.executionCtx.waitUntil(Promise.allSettled([
    notifyAdmins(c.env, 'new_lead', `নতুন লিড (${label}): ${name}`, `#/leads/${leadId}`),
    // Instant team alerts (email / Telegram / webhook) so a person can reply within minutes.
    alertNewLead(c.env, {
      id: leadId, name, phone, source, sourceLabel: label, answers: answerPairs, message: Object.keys(answers).length ? '' : message,
      campaign: [attr.utm_source, attr.utm_campaign, attr.utm_content].filter(Boolean).join(' / '), pageUrl: pageUrl || attr.source_url, internal: attr.internal,
    }, adminUrl),
    sendMetaEvent(c.env, s.meta_pixel_id, {
      internal: attr.internal,
      name: 'Lead', eventId, sourceUrl: pageUrl || attr.source_url || publicOrigin(c.env),
      user: { email, phone, firstName: name, ip, userAgent: c.req.header('user-agent'), fbp: attr.fbp, fbc: attr.fbc, externalId: phone },
      customData: { lead_source: source, content_ids: packageId ? [String(packageId)] : [], ...(answers.category ? { content_category: answers.category } : {}), ...(answers.site_type ? { site_type: answers.site_type } : {}) },
    }),
  ]).then((rs) => rs.forEach((x) => x.status === 'rejected' && console.error(x.reason))));

  // Hand-off: open WhatsApp with everything the visitor told us, so the conversation starts warm.
  const waNumber = s.whatsapp_number || (await c.env.DB.prepare('SELECT whatsapp_number FROM chat_settings WHERE id = 1').first<{ whatsapp_number: string }>())?.whatsapp_number || '';
  const waText = [`আসসালামু আলাইকুম, আমি ${name}।`, ...answerPairs.map(([k, v]) => `${k}: ${v}`), `(রেফারেন্স: লিড #${leadId})`].join('\n');
  return ok(c, { eventId, leadId, whatsappUrl: whatsappLink(waNumber, waText) || null, bookingUrl: s.booking_url || null }, 201);
});

/* ---------------- Tracking beacon (PageView / ViewContent mirror) ---------------- */
publicApi.post('/api/track', async (c) => {
  await rateLimit(c.env, 'track', clientIp(c.req.raw), 120, 60);
  const b = await readJson<{ event?: string; eventId?: string; url?: string; customData?: Record<string, unknown>; fbp?: string; fbc?: string }>(c);
  // Only browsing events can be mirrored this way. Lead / InitiateCheckout / Purchase are fired by the server
  // itself at the moment they are confirmed, so they can never be triggered from the browser.
  // LeadBoxStep is a custom (non-conversion) signal: which lead-box question was answered, for audiences.
  if (b.event !== 'PageView' && b.event !== 'ViewContent' && b.event !== 'LeadBoxStep') fail(422, 'অননুমোদিত ইভেন্ট');
  const eventId = clampStr(b.eventId, 64);
  if (!/^[\w-]{8,64}$/.test(eventId)) fail(422, 'ইভেন্ট আইডি সঠিক নয়');
  const url = clampStr(b.url, 1000);
  // Only page views of this site (the Worker itself or the public storefront, e.g. GitHub Pages) are mirrored.
  const own = [c.env.SITE_URL, publicOrigin(c.env)].map((o) => o.replace(/\/$/, ''));
  if (!own.some((o) => url === o || url.startsWith(o + '/') || url.startsWith(o + '?'))) return ok(c, { sent: false });
  const s = await getSettings(c.env);
  const cd = (b.customData && typeof b.customData === 'object' ? b.customData : {}) as Record<string, unknown>;
  const custom = b.event === 'ViewContent'
    ? { content_ids: Array.isArray(cd.content_ids) ? cd.content_ids.slice(0, 5).map(String) : [], content_type: 'product', value: toInt(cd.value), currency: 'BDT' }
    : b.event === 'LeadBoxStep' ? { step: clampStr(cd.step, 30), answer: clampStr(cd.answer, 80) } : {};
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

/** The business's own contact details, in the words the assistant may share. */
function contactInfo(env: AppBindings['Bindings'], s: Awaited<ReturnType<typeof getSettings>>, cs: ChatSettingsRow) {
  const waIntl = normalizeBdPhone(s.whatsapp_number || cs.whatsapp_number || s.contact_phone || '');
  const waLocal = waIntl.startsWith('880') ? '0' + waIntl.slice(3) : waIntl;
  const waLink = s.whatsapp_link || whatsappLink(waIntl, cs.whatsapp_message);
  const fb = (s.facebook_page || cs.messenger_page || '').replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '');
  const emails = [...new Set([s.contact_email, s.support_email].filter(Boolean))];
  const lines = [
    waLocal ? `- হোয়াটসঅ্যাপ ও ফোন: ${waLocal}${waLink ? ` — হোয়াটসঅ্যাপ লিংক: ${waLink}` : ''}` : '',
    s.contact_phone && normalizeBdPhone(s.contact_phone) !== waIntl ? `- ফোন: ${s.contact_phone}` : '',
    emails.length ? `- ইমেইল: ${emails.join(', ')}` : '',
    fb ? `- ফেসবুক পেজ: https://facebook.com/${fb} (মেসেঞ্জার: ${messengerLink(fb)})` : '',
    s.contact_address ? `- ঠিকানা: ${s.contact_address}${s.map_url ? ` (ম্যাপ: ${s.map_url})` : ''}` : '',
    s.business_hours ? `- কাজের সময়: ${s.business_hours}` : '',
    `- ওয়েবসাইট: ${publicOrigin(env)}`,
  ].filter(Boolean);
  return { waIntl, waLocal, waLink, text: lines.join('\n') };
}

/**
 * What the chat assistant knows, kept short on purpose (about a third of the old size): every chat message
 * sends all of it, so a long text burns the free Gemini quota in minutes and is too long for the Workers AI
 * fallback. Package FAQs stay on the package pages; the assistant links there.
 */
export async function buildKnowledge(env: AppBindings['Bindings'], extra: string, contacts: string): Promise<string> {
  const now = Date.now();
  const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
  const pkgs = await loadPublicPackages(env);
  const faqs = (await env.DB.prepare(`SELECT question, answer FROM faqs WHERE is_active = 1 AND scope = 'sitewide' ORDER BY sort_order, id LIMIT 12`).all<{ question: string; answer: string }>()).results;
  const s = await getSettings(env);
  const site = publicOrigin(env);
  const pk = pkgs.map((p) => {
    const offer = p.offers.find((o) => isOfferLive(o, now));
    return [
      `- ${p.name} (${p.categoryName})`,
      `${taka(p.basePrice)} এককালীন${offer ? `, অফার: ${offer.discountType === 'percent' ? offer.discountValue + '%' : taka(offer.discountValue)} ছাড়` : ''}${p.status === 'coming_soon' ? ' [শীঘ্রই আসছে]' : ''}`,
      `${p.deliveryDays} কর্মদিবস`,
      cut(p.shortDescription, 130),
      p.demoUrl ? `ডেমো: ${p.demoUrl}` : '',
      `${site}/package/${p.slug}`,
    ].filter(Boolean).join(' | ');
  }).join('\n');
  return [
    `প্রতিষ্ঠান: ${s.brand_name}।`,
    `যোগাযোগ (ভিজিটর চাইলে সরাসরি দেবে — ডেভেলপার ও মালিকের সাথেও এই নম্বরেই কথা বলা যায়):\n${contacts}`,
    'কাজের ধাপ: প্যাকেজ বাছাই → অনলাইনে পেমেন্ট (বিকাশ/নগদ/রকেট/কার্ড/ব্যাংক) → তথ্য জমা → ডেভেলপমেন্ট → ক্লায়েন্ট রিভিউ → সংশোধন → ডেলিভারি। পেমেন্ট নিশ্চিত হওয়ার আগে কাজ শুরু হয় না। প্রতিটি প্যাকেজের বিস্তারিত ফিচার ও প্রশ্নোত্তর তার পেজে আছে।',
    `প্যাকেজসমূহ (নাম | দাম | ডেলিভারি | কার জন্য | ডেমো | বিস্তারিত):\n${pk}`,
    faqs.length ? `প্রশ্নোত্তর:\n${faqs.map((f) => `প্র: ${f.question}\nউ: ${cut(f.answer, 260)}`).join('\n')}` : '',
    extra ? `অতিরিক্ত তথ্য:\n${cut(extra, 2000)}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 12000);
}

const ESCALATE = '[ESCALATE]';
/** Visitor asks for a number, a person, the developer or the owner. */
const CONTACT_INTENT = /নম্বর|নাম্বার|ফোন|মোবাইল|হোয়াটস|হোয়াটস|whats\s?app|imo|কল|call|contact|যোগাযোগ|ডেভেলপার|developer|মালিক|owner|মানুষ|human|agent|প্রতিনিধি|এডমিন|অ্যাডমিন|কথা বলতে/i;

type ChatConv = { id: number; status: string; transcript: string; lead_id: number | null; visitor_name: string; visitor_phone: string };

/** Save a chat visitor as a lead (once per conversation), and alert the team at once. Returns the Meta event id. */
async function saveChatLead(c: Context<AppBindings>, conv: ChatConv | null, name: string, phone: string, attributionRaw: unknown): Promise<string | null> {
  const transcript = parseJson<{ role: string; content: string }[]>(conv?.transcript, []);
  const summary = transcript.filter((m) => m.role === 'user').map((m) => `• ${m.content}`).join('\n').slice(0, 2500);
  const s = await getSettings(c.env);
  if (conv?.lead_id) {
    // Already a lead from this chat: fill in a better name or a new number, but never a duplicate lead.
    await c.env.DB.prepare(`UPDATE leads SET name = CASE WHEN ? != '' AND name = 'চ্যাট ভিজিটর' THEN ? ELSE name END, phone = CASE WHEN ? != '' THEN ? ELSE phone END, message = ? WHERE id = ?`)
      .bind(name, name, phone, phone, summary, conv.lead_id).run();
    await c.env.DB.prepare('UPDATE chat_conversations SET visitor_name = CASE WHEN ? != \'\' THEN ? ELSE visitor_name END, visitor_phone = CASE WHEN ? != \'\' THEN ? ELSE visitor_phone END, updated_at = ? WHERE id = ?')
      .bind(name, name, phone, phone, nowIso(), conv.id).run();
    return null;
  }
  const attr = readAttribution(attributionRaw, c.req.header('cookie') || '');
  const eventId = `ld_${randomToken(12)}`;
  const leadName = name || conv?.visitor_name || 'চ্যাট ভিজিটর';
  const lead = await c.env.DB.prepare(
    `INSERT INTO leads (source, name, phone, message, lead_event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, landing_page_id, source_url, next_follow_up_at, is_internal)
     VALUES ('chat', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(leadName, phone, summary, eventId, attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_content, attr.utm_term, attr.fbclid, attr.landing_page_id, attr.source_url,
    new Date(Date.now() + s.lead_followup_hours * 3600_000).toISOString(), attr.internal ? 1 : 0).first<{ id: number }>();
  const leadId = lead!.id;
  if (conv) await c.env.DB.prepare("UPDATE chat_conversations SET visitor_name = ?, visitor_phone = ?, lead_id = ?, status = 'escalated', updated_at = ? WHERE id = ?").bind(leadName, phone, leadId, nowIso(), conv.id).run();
  const adminUrl = `${c.env.SITE_URL.replace(/\/$/, '')}/admin/#/leads/${leadId}`;
  c.executionCtx.waitUntil(Promise.allSettled([
    notifyAdmins(c.env, 'new_lead', `চ্যাট থেকে নতুন লিড: ${leadName}`, `#/leads/${leadId}`),
    alertNewLead(c.env, {
      id: leadId, name: leadName, phone, source: 'chat', sourceLabel: SOURCE_BN.chat, answers: [], message: summary,
      campaign: [attr.utm_source, attr.utm_campaign, attr.utm_content].filter(Boolean).join(' / '), pageUrl: attr.source_url, internal: attr.internal,
    }, adminUrl),
    sendMetaEvent(c.env, s.meta_pixel_id, {
      internal: attr.internal, name: 'Lead', eventId, sourceUrl: attr.source_url || publicOrigin(c.env),
      user: { phone, firstName: name || undefined, ip: clientIp(c.req.raw), userAgent: c.req.header('user-agent'), fbp: attr.fbp, fbc: attr.fbc, externalId: phone },
      customData: { lead_source: 'chat' },
    }),
  ]).then((rs) => rs.forEach((x) => x.status === 'rejected' && console.error(x.reason))));
  return eventId;
}

publicApi.post('/api/chat/ai', async (c) => {
  await rateLimit(c.env, 'chat', clientIp(c.req.raw), 30, 600);
  const b = await readJson<{ sessionId?: string; message?: string; attribution?: unknown }>(c);
  const sessionId = clampStr(b.sessionId, 64);
  const message = clampStr(b.message, 600);
  if (!/^[\w-]{10,64}$/.test(sessionId) || !message) fail(422, 'বার্তা সঠিক নয়');
  const cs = await chatSettings(c);
  if (!cs?.ai_enabled) fail(503, 'এআই সাপোর্ট এখন বন্ধ আছে');
  const s = await getSettings(c.env);
  const contacts = contactInfo(c.env, s, cs);

  let conv = await c.env.DB.prepare('SELECT * FROM chat_conversations WHERE session_id = ?').bind(sessionId).first<ChatConv>();
  if (!conv) conv = await c.env.DB.prepare('INSERT INTO chat_conversations (session_id) VALUES (?) RETURNING *').bind(sessionId).first<ChatConv>();
  const transcript = parseJson<{ role: 'user' | 'assistant'; content: string; at: string }[]>(conv!.transcript, []).slice(-20);
  transcript.push({ role: 'user', content: message, at: nowIso() });
  conv!.transcript = JSON.stringify(transcript);

  // A number typed in the chat is a lead — saved right away, before the AI even answers.
  const typedPhone = phoneInText(message, [contacts.waIntl, normalizeBdPhone(s.contact_phone)].filter(Boolean));
  const typedName = nameInText(message);
  const hadLead = !!conv!.lead_id;
  let leadEventId: string | null = null;
  if (typedPhone || (typedName && hadLead)) leadEventId = await saveChatLead(c, conv, typedName, typedPhone, b.attribution);
  const hasLead = hadLead || !!typedPhone;
  const wantsContact = CONTACT_INTENT.test(message);
  const userTurns = transcript.filter((m) => m.role === 'user').length;

  const leadRule = typedPhone && !hadLead
    ? `ভিজিটর এইমাত্র তার নম্বর দিয়েছেন (${typedPhone.replace(/^880/, '0')})। ধন্যবাদ জানাও, বলো আমাদের টিম শীঘ্রই এই নম্বরে হোয়াটসঅ্যাপ বা কল করবে; প্রশ্ন থাকলে উত্তর দাও। আর নম্বর চাইবে না।${typedName ? '' : ' নাম না জানা থাকলে ভদ্রভাবে নাম জিজ্ঞেস করো।'}`
    : hasLead
      ? 'ভিজিটরের নম্বর আগেই পাওয়া গেছে — আর নম্বর চাইবে না, শুধু প্রশ্নের উত্তর দাও।'
      : 'ভিজিটরের নাম ও হোয়াটসঅ্যাপ নম্বর এখনো পাওয়া যায়নি। উত্তরের শেষে এক লাইনে ভদ্রভাবে তার নাম ও হোয়াটসঅ্যাপ নম্বর চাও — যেমন: “আপনার নাম ও হোয়াটসঅ্যাপ নম্বর দিলে আমাদের টিম ফ্রি পরামর্শ ও আপনার ব্যবসার মতো ডেমো পাঠাবে।”';

  let answer = '';
  let escalate = false;
  let provider = '';
  try {
    const cfg = await getAIConfig(c.env, 'chat');
    if (!cfg) throw new Error('no_chat_config');
    const system = `${cfg.system_prompt}\nলেখার ধরন: ${cfg.tone}

তুমি ${s.brand_name}-এর ওয়েবসাইটের বিক্রয় সহায়ক। তোমার দুটি কাজ: ভিজিটরকে তার ব্যবসার জন্য সঠিক প্যাকেজ বুঝতে সাহায্য করা, এবং তার নাম ও হোয়াটসঅ্যাপ নম্বর নেওয়া যাতে আমাদের টিম যোগাযোগ করতে পারে।

নিয়ম:
১. সবসময় বাংলায়, ছোট করে (৩–৫ বাক্য), বন্ধুর মতো উত্তর দাও। শুধু নিচের তথ্য ব্যবহার করবে; দাম, ছাড়, সময় বা ফিচার নিজে বানাবে না। সাধারণ লেখা দেবে — ** , # বা অন্য মার্কডাউন চিহ্ন নয় (চ্যাটে ওগুলো চিহ্ন হিসেবেই দেখা যায়)।
২. কেউ ফোন বা হোয়াটসঅ্যাপ নম্বর, ডেভেলপার, মালিক, মানুষ বা যোগাযোগের তথ্য চাইলে কখনো “দিতে পারি না” বলবে না — “যোগাযোগ” অংশ থেকে হোয়াটসঅ্যাপ নম্বর ও লিংক সরাসরি দেবে।
৩. ${leadRule}
৪. নিশ্চিত উত্তর জানা না থাকলে বা ভিজিটর মানুষের সাথে কথা বলতে চাইলে উত্তরের শুরুতে হুবহু ${ESCALATE} লিখবে এবং হোয়াটসঅ্যাপ নম্বর দেবে।
৫. কোনো প্যাকেজের কথা বললে তার লাইভ ডেমো বা বিস্তারিত লিংক দাও।

${await buildKnowledge(c.env, cs.knowledge, contacts.text)}`;
    const r = await generateWithFallback(c.env, cfg, { system, messages: transcript.map(({ role, content }) => ({ role, content })), maxTokens: 600, temperature: 0.3 });
    if (r.error) console.error('chat ai: configured provider failed, answered with', r.provider, r.error);
    provider = r.provider;
    answer = plainChatText(r.text);
    if (answer.includes(ESCALATE)) { escalate = true; answer = answer.split(ESCALATE).join('').trim(); }
  } catch (e) {
    console.error('chat ai failed', e);
    if (leadEventId) {
      // No AI right now, but the visitor just left their number — that is what matters.
      answer = 'ধন্যবাদ! আপনার নম্বর পেয়েছি — আমাদের টিম শীঘ্রই এই নম্বরে হোয়াটসঅ্যাপ বা কল করবে।';
    } else {
      escalate = true;
      answer = 'দুঃখিত, এই মুহূর্তে স্বয়ংক্রিয় উত্তর দিতে পারছি না।';
    }
  }
  // The number is always given when asked for — whatever the model wrote.
  if ((wantsContact || escalate) && contacts.waLocal && !answer.replace(/[^\d]/g, '').includes(contacts.waLocal.slice(1))) {
    answer += `\n\nসরাসরি হোয়াটসঅ্যাপ বা কল করুন: ${contacts.waLocal}${contacts.waLink ? `\n${contacts.waLink}` : ''}`;
  }
  if (escalate && !hasLead && cs.escalation_message) answer = [answer, cs.escalation_message].join('\n\n');
  transcript.push({ role: 'assistant', content: answer, at: nowIso() });
  await c.env.DB.prepare('UPDATE chat_conversations SET transcript = ?, status = CASE WHEN ? THEN \'escalated\' ELSE status END, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(transcript.slice(-30)), escalate ? 1 : 0, nowIso(), conv!.id).run();
  if (escalate && conv!.status !== 'escalated' && !leadEventId) await notifyAdmins(c.env, 'chat_escalated', 'একটি চ্যাট মানুষের সহায়তা চাইছে', '#/chats');
  return ok(c, {
    answer, escalate, provider,
    /** Show the name + number form under the answer (until the visitor has left a number). */
    askLead: !hasLead && (escalate || wantsContact || userTurns >= 2),
    /** A lead was saved from this message — the browser fires Pixel "Lead" with this id (deduplicated with the server event). */
    leadEventId,
    whatsapp: contacts.waLink || null,
  });
});

/** Visitor leaves name + phone in the chat form → becomes a lead (or completes the one saved from the chat). */
publicApi.post('/api/chat/handoff', async (c) => {
  await rateLimit(c.env, 'handoff', clientIp(c.req.raw), 5, 600);
  const b = await readJson<{ sessionId?: string; name?: string; phone?: string; attribution?: unknown }>(c);
  const sessionId = clampStr(b.sessionId, 64);
  const name = clampStr(b.name, 100);
  const phone = normalizeBdPhone(clampStr(b.phone, 30));
  if (!name || !phone) fail(422, 'নাম ও সঠিক মোবাইল নম্বর দিন');
  const conv = /^[\w-]{10,64}$/.test(sessionId) ? await c.env.DB.prepare('SELECT * FROM chat_conversations WHERE session_id = ?').bind(sessionId).first<ChatConv>() : null;
  const eventId = await saveChatLead(c, conv, name, phone, b.attribution);
  return ok(c, { eventId });
});
