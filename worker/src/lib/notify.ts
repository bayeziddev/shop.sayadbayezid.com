import type { Env } from '../env';
import { PROJECT_STATUS_BN, type ProjectStatus } from '../../../shared/status';
import { normalizeBdPhone } from './util';
import { portalUrl } from './portal-token';
import { getSettings } from './settings';

/**
 * Outbound client notifications. Each channel is optional: if its secrets are not
 * configured it is skipped (and logged as skipped), never faked.
 */
interface Msg { to: { email?: string; phone?: string }; subject: string; text: string; orderId?: number; leadId?: number }

async function log(env: Env, channel: string, recipient: string, subject: string, status: string, error = '', orderId?: number, leadId?: number) {
  await env.DB.prepare('INSERT INTO notification_log (channel, recipient, subject, status, error, order_id, lead_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(channel, recipient.replace(/(.{3}).+(.{3})/, '$1•••$2'), subject, status, error.slice(0, 300), orderId ?? null, leadId ?? null).run();
}

async function sendEmail(env: Env, m: Msg) {
  if (!m.to.email) return;
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return log(env, 'email', m.to.email, m.subject, 'skipped', 'not_configured', m.orderId, m.leadId);
  const html = `<div style="font-family:'Hind Siliguri',sans-serif;font-size:15px;line-height:1.7;color:#111">${m.text
    .split('\n').map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')).join('<br>')}</div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.to.email], subject: m.subject, text: m.text, html }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as const);
  await log(env, 'email', m.to.email, m.subject, r.ok ? 'sent' : 'failed', r.ok ? '' : `http_${r.status}`, m.orderId, m.leadId);
}

async function sendSms(env: Env, m: Msg) {
  const phone = normalizeBdPhone(m.to.phone || '');
  if (!phone) return;
  if (!env.SMS_API_URL) return log(env, 'sms', phone, m.subject, 'skipped', 'not_configured', m.orderId, m.leadId);
  // SMS_API_URL is a template, e.g. https://bulksmsbd.net/api/smsapi?api_key={api_key}&type=text&number={number}&senderid={sender}&message={message}
  const url = env.SMS_API_URL
    .replace('{api_key}', encodeURIComponent(env.SMS_API_KEY || ''))
    .replace('{sender}', encodeURIComponent(env.SMS_SENDER_ID || ''))
    .replace('{number}', phone)
    .replace('{message}', encodeURIComponent(m.text.slice(0, 600)));
  const r = await fetch(url).catch(() => ({ ok: false, status: 0 }) as const);
  await log(env, 'sms', phone, m.subject, r.ok ? 'sent' : 'failed', r.ok ? '' : `http_${r.status}`, m.orderId, m.leadId);
}

async function sendWhatsApp(env: Env, m: Msg, params: string[]) {
  const phone = normalizeBdPhone(m.to.phone || '');
  if (!phone) return;
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_TEMPLATE)
    return log(env, 'whatsapp', phone, m.subject, 'skipped', 'not_configured', m.orderId, m.leadId);
  // Business-initiated WhatsApp messages must use an approved template (Bangla, language code "bn").
  const r = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: { name: env.WHATSAPP_TEMPLATE, language: { code: 'bn' }, components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: t })) }] },
    }),
  }).catch(() => ({ ok: false, status: 0 }) as const);
  await log(env, 'whatsapp', phone, m.subject, r.ok ? 'sent' : 'failed', r.ok ? '' : `http_${r.status}`, m.orderId, m.leadId);
}

export async function sendAll(env: Env, m: Msg, waParams: string[]) {
  await Promise.allSettled([sendEmail(env, m), sendSms(env, m), sendWhatsApp(env, m, waParams)]);
}

export interface NotifiableOrder { id: number; order_number: string; customer_name: string; customer_phone: string; customer_email: string }

export async function notifyStatusChange(env: Env, order: NotifiableOrder, status: ProjectStatus, note = '') {
  const s = await getSettings(env);
  const link = await portalUrl(env, order.order_number);
  const label = PROJECT_STATUS_BN[status];
  const extra: Partial<Record<ProjectStatus, string>> = {
    confirmed: 'আপনার পেমেন্ট নিশ্চিত হয়েছে। কাজ শুরু করতে নিচের লিংকে গিয়ে আপনার ব্যবসার তথ্য জমা দিন।',
    client_review: 'আপনার সাইটের প্রিভিউ তৈরি। লিংকে গিয়ে দেখে মতামত বা অনুমোদন দিন।',
    delivered: 'আপনার সাইট ডেলিভারি করা হয়েছে। ফাইল ও লিংক পোর্টালে পাবেন।',
    completed: 'প্রজেক্টটি সম্পূর্ণ হয়েছে। আমাদের সাথে কাজ করার জন্য ধন্যবাদ — আপনার অভিজ্ঞতা জানিয়ে একটি রিভিউ দিলে খুশি হব।',
  };
  const text = [
    `প্রিয় ${order.customer_name},`,
    `আপনার অর্ডার ${order.order_number}-এর অবস্থা: ${label}`,
    extra[status] || '',
    note ? `নোট: ${note}` : '',
    `বিস্তারিত: ${link}`,
    `— ${s.brand_name}`,
  ].filter(Boolean).join('\n');
  await sendAll(env, { to: { email: order.customer_email, phone: order.customer_phone }, subject: `অর্ডার ${order.order_number}: ${label}`, text, orderId: order.id }, [order.customer_name, order.order_number, label, link]);
}

/** A course order is paid: tell the student their course is open and where to sign in. */
export async function notifyCourseReady(env: Env, order: NotifiableOrder, courseTitles: string[]) {
  const s = await getSettings(env);
  const link = `${env.SITE_URL.replace(/\/$/, '')}/student`;
  const text = [
    `প্রিয় ${order.customer_name},`,
    `আপনার পেমেন্ট নিশ্চিত হয়েছে — কোর্স চালু হয়েছে: ${courseTitles.join(', ')}`,
    `মোবাইল নম্বর আর পাসওয়ার্ড দিয়ে লগইন করে প্রোফাইল থেকে লেসন দেখুন: ${link}`,
    `— ${s.brand_name}`,
  ].join('\n');
  await sendAll(env, { to: { email: order.customer_email, phone: order.customer_phone }, subject: `কোর্স চালু হয়েছে — ${order.order_number}`, text, orderId: order.id }, [order.customer_name, order.order_number, 'কোর্স চালু', link]);
}

export async function notifyAdminEmail(env: Env, subject: string, text: string) {
  if (env.ADMIN_ALERT_EMAIL) await sendEmail(env, { to: { email: env.ADMIN_ALERT_EMAIL }, subject, text });
}

/* ---------------- Instant new-lead alerts (team-facing) ---------------- */

export interface LeadAlert {
  id: number;
  name: string;
  phone: string;
  source: string;
  sourceLabel: string;
  answers: [string, string][];
  message: string;
  campaign: string;
  pageUrl: string;
  internal: boolean;
}

/** Plain-text summary used by every alert channel. Includes a one-tap WhatsApp link to the lead, so follow-up takes seconds. */
export function leadAlertText(l: LeadAlert, adminUrl: string): string {
  const wa = `https://wa.me/${normalizeBdPhone(l.phone) || l.phone.replace(/\D/g, '')}`;
  return [
    `${l.internal ? '🧪 টেস্ট লিড (আপনার নিজের ব্রাউজার)' : '🔔 নতুন লিড'} — ${l.sourceLabel}`,
    `নাম: ${l.name}`,
    `ফোন/হোয়াটসঅ্যাপ: ${l.phone}`,
    ...l.answers.map(([k, v]) => `${k}: ${v}`),
    l.message ? `বার্তা: ${l.message}` : '',
    l.campaign ? `ক্যাম্পেইন: ${l.campaign}` : '',
    l.pageUrl ? `পেজ: ${l.pageUrl}` : '',
    `হোয়াটসঅ্যাপে উত্তর দিন: ${wa}`,
    `অ্যাডমিনে দেখুন: ${adminUrl}`,
  ].filter(Boolean).join('\n');
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number }> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return { ok: !!r?.ok, status: r?.status ?? 0 };
}

/**
 * Fan a new lead out to every configured team channel at once (each is optional and logged):
 * - email via Resend to the "lead alert emails" setting (+ ADMIN_ALERT_EMAIL)
 * - Telegram bot (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
 * - any webhook (LEAD_WEBHOOK_URL): Discord / Slack get their native format, anything else gets JSON.
 */
export async function alertNewLead(env: Env, l: LeadAlert, adminUrl: string): Promise<void> {
  const s = await getSettings(env);
  const text = leadAlertText(l, adminUrl);
  const subject = `${l.internal ? '[টেস্ট] ' : ''}নতুন লিড: ${l.name} (${l.sourceLabel})`;
  const tasks: Promise<unknown>[] = [];

  const emails = [...new Set([...(s.lead_alert_emails || '').split(','), env.ADMIN_ALERT_EMAIL || ''].map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))].slice(0, 5);
  for (const to of emails) tasks.push(sendEmail(env, { to: { email: to }, subject, text, leadId: l.id }));

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    tasks.push(
      postJson(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true })
        .then((r) => log(env, 'telegram', String(env.TELEGRAM_CHAT_ID), subject, r.ok ? 'sent' : 'failed', r.ok ? '' : `http_${r.status}`, undefined, l.id)),
    );
  }
  if (env.LEAD_WEBHOOK_URL && /^https:\/\//.test(env.LEAD_WEBHOOK_URL)) {
    const u = env.LEAD_WEBHOOK_URL;
    const body = /discord(app)?\.com\/api\/webhooks/.test(u)
      ? { content: text.slice(0, 1900) }
      : /hooks\.slack\.com/.test(u)
        ? { text }
        : { event: 'lead.created', text, lead: { id: l.id, name: l.name, phone: l.phone, source: l.source, answers: Object.fromEntries(l.answers), message: l.message, campaign: l.campaign, page_url: l.pageUrl, internal: l.internal }, admin_url: adminUrl };
    tasks.push(postJson(u, body).then((r) => log(env, 'webhook', new URL(u).host, subject, r.ok ? 'sent' : 'failed', r.ok ? '' : `http_${r.status}`, undefined, l.id)));
  }
  await Promise.allSettled(tasks);
}
