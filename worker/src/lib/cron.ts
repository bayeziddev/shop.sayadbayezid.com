import type { Env } from '../env';
import { getSettings } from './settings';
import { sendAll } from './notify';
import { notifyAdmins } from './audit';
import { nowIso } from './util';

/** Hourly maintenance (wrangler.toml [triggers]). */
export async function runScheduled(env: Env): Promise<void> {
  const s = await getSettings(env);
  const now = nowIso();

  // 1) Automated follow-up for quote requests / leads that went quiet.
  const due = (
    await env.DB.prepare(
      `SELECT * FROM leads WHERE status IN ('new','follow_up') AND next_follow_up_at IS NOT NULL AND next_follow_up_at <= ? AND auto_followups_sent < ? LIMIT 25`,
    ).bind(now, s.lead_followup_max).all<{ id: number; name: string; phone: string; email: string; auto_followups_sent: number }>()
  ).results;
  for (const l of due) {
    await sendAll(env, {
      to: { phone: l.phone, email: l.email },
      subject: 'আপনার ওয়েবসাইটের অনুরোধ',
      text: `প্রিয় ${l.name}, আপনার ওয়েবসাইটের অনুরোধটি আমরা পেয়েছি। কোনো প্রশ্ন থাকলে এই মেসেজের উত্তর দিন অথবা ${env.SITE_URL} এ চ্যাট করুন। — ${s.brand_name}`,
      leadId: l.id,
    }, [l.name, s.brand_name]);
    await env.DB.prepare("UPDATE leads SET auto_followups_sent = auto_followups_sent + 1, status = 'follow_up', next_follow_up_at = ?, updated_at = ? WHERE id = ?")
      .bind(new Date(Date.now() + s.lead_followup_hours * 2 * 3600_000).toISOString(), now, l.id).run();
  }

  // 2) Projects stuck in one status too long → one admin notification per order per day.
  const stuckBefore = new Date(Date.now() - s.stuck_threshold_days * 86_400_000).toISOString();
  const stuck = (
    await env.DB.prepare(
      `SELECT id, order_number, project_status FROM orders WHERE project_status IN ('confirmed','requirements_collected','in_development','client_review','revisions') AND status_changed_at < ? LIMIT 50`,
    ).bind(stuckBefore).all<{ id: number; order_number: string }>()
  ).results;
  for (const o of stuck) {
    const k = `stuck-notified:${o.id}:${now.slice(0, 10)}`;
    if (await env.KV.get(k)) continue;
    await env.KV.put(k, '1', { expirationTtl: 86_400 * 2 });
    await notifyAdmins(env, 'stuck', `${o.order_number} অনেক দিন একই অবস্থায় আছে`, `#/orders/${o.id}`);
  }

  // 3) Abandoned unpaid orders older than 14 days → cancelled (keeps the pipeline clean; no invoice number was ever used).
  await env.DB.prepare(
    `UPDATE orders SET project_status = 'cancelled', status_changed_at = ?, updated_at = ? WHERE payment_status IN ('unpaid','failed') AND project_status = 'pending_payment' AND created_at < ?`,
  ).bind(now, now, new Date(Date.now() - 14 * 86_400_000).toISOString()).run();
}
