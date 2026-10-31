import type { Env } from '../env';
import { parseJson } from './util';

export interface SiteSettings {
  brand_name: string;
  brand_tagline: string;
  contact_phone: string;
  contact_email: string;
  contact_address: string;
  business_hours: string;
  meta_pixel_id: string;
  ga4_id: string;
  gtm_id: string;
  clarity_id: string;
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
  meta_pixel_id: '',
  ga4_id: '',
  gtm_id: '',
  clarity_id: '',
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
