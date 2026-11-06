import type { Env } from '../env';
import { parseJson } from './util';

export interface SiteSettings {
  brand_name: string;
  brand_tagline: string;
  contact_phone: string;
  contact_email: string;
  contact_address: string;
  business_hours: string;
  support_email: string;
  /** WhatsApp number with country code (8801…) — used for the lead box hand-off with a pre-filled message. */
  whatsapp_number: string;
  /** Optional WhatsApp short link (wa.me/message/…) shown as the general "chat on WhatsApp" link. */
  whatsapp_link: string;
  facebook_page: string;
  map_url: string;
  /** Where new-lead alert emails go (comma separated). Needs RESEND_API_KEY + EMAIL_FROM. */
  lead_alert_emails: string;
  /** Optional booking page (Calendly / Google Calendar appointment) offered after the lead box. */
  booking_url: string;
  lead_box_enabled: boolean;
  /** Seconds on the site before the lead box opens by itself (first visit only). */
  lead_box_delay: number;
  /** On phones, open WhatsApp with the visitor's answers right after they submit. */
  lead_box_auto_whatsapp: boolean;
  lead_box_title: string;
  meta_pixel_id: string;
  ga4_id: string;
  gtm_id: string;
  clarity_id: string;
  /** GA4 is configured inside the GTM container → don't also load gtag.js (avoids double-counted page views). */
  ga4_via_gtm: boolean;
  /** Meta Events Manager → Test events code. While set, server events appear under "Test events". Clear it after testing. */
  meta_test_event_code: string;
  /** "কেন আমরা সেরা" — one point per line: শিরোনাম | বিবরণ */
  why_us: string;
  pay_sslcommerz_enabled: boolean;
  pay_stripe_enabled: boolean;
  pay_bank_enabled: boolean;
  pay_manual_mfs_enabled: boolean;
  manual_bkash_number: string;
  manual_nagad_number: string;
  manual_rocket_number: string;
  bank_details: string;
  usd_rate: number;
  referral_enabled: boolean;
  referral_percent: number;
  stuck_threshold_days: number;
  lead_followup_hours: number;
  lead_followup_max: number;
  onboarding_dismissed: boolean;
  page_about: string;
  page_refund: string;
  page_terms: string;
  page_privacy: string;
}

export const SETTINGS_DEFAULTS: SiteSettings = {
  brand_name: 'Cwb Agency',
  brand_tagline: '',
  contact_phone: '',
  contact_email: '',
  contact_address: '',
  business_hours: '',
  support_email: '',
  whatsapp_number: '',
  whatsapp_link: '',
  facebook_page: '',
  map_url: '',
  lead_alert_emails: '',
  booking_url: '',
  lead_box_enabled: true,
  lead_box_delay: 10,
  lead_box_auto_whatsapp: true,
  lead_box_title: 'আপনার ব্যবসার জন্য কেমন ওয়েবসাইট চান?',
  meta_pixel_id: '',
  ga4_id: '',
  gtm_id: '',
  clarity_id: '',
  ga4_via_gtm: false,
  meta_test_event_code: '',
  why_us: '',
  pay_sslcommerz_enabled: true,
  pay_stripe_enabled: false,
  pay_bank_enabled: true,
  pay_manual_mfs_enabled: false,
  manual_bkash_number: '',
  manual_nagad_number: '',
  manual_rocket_number: '',
  bank_details: '',
  usd_rate: 122,
  referral_enabled: true,
  referral_percent: 5,
  stuck_threshold_days: 3,
  lead_followup_hours: 24,
  lead_followup_max: 2,
  onboarding_dismissed: false,
  page_about: '',
  page_refund: '',
  page_terms: '',
  page_privacy: '',
};

const CACHE_KEY = 'settings:v1';

/** Settings are cached in KV for 60s; writes invalidate. */
export async function getSettings(env: Env): Promise<SiteSettings> {
  const cached = await env.KV.get(CACHE_KEY, 'json').catch(() => null);
  if (cached) return { ...SETTINGS_DEFAULTS, ...(cached as Partial<SiteSettings>) };
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const out: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
  for (const r of results) out[r.key] = parseJson(r.value, null);
  if (!out.meta_pixel_id && env.META_PIXEL_ID) out.meta_pixel_id = env.META_PIXEL_ID;
  await env.KV.put(CACHE_KEY, JSON.stringify(out), { expirationTtl: 60 }).catch(() => {});
  return out as unknown as SiteSettings;
}

export async function saveSettings(env: Env, patch: Partial<SiteSettings>): Promise<void> {
  const stmts = Object.entries(patch)
    .filter(([k]) => k in SETTINGS_DEFAULTS)
    .map(([k, v]) =>
      env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, JSON.stringify(v)),
    );
  if (stmts.length) await env.DB.batch(stmts);
  await env.KV.delete(CACHE_KEY);
}
