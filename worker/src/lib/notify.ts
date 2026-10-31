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

export async function notifyAdminEmail(env: Env, subject: string, text: string) {
  if (env.ADMIN_ALERT_EMAIL) await sendEmail(env, { to: { email: env.ADMIN_ALERT_EMAIL }, subject, text });
}
