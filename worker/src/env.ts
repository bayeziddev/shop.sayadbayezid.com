import type { Role } from '../../shared/status';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  /** Optional: R2 must be enabled on the account. Without it, uploads are disabled but the site works. */
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  AI?: Ai;
  BROWSER?: Fetcher;

  // vars
  /** Origin of the Worker itself (payments, emails, portal, admin, API). */
  SITE_URL: string;
  /**
   * Optional public storefront origin when the static pages are hosted elsewhere (GitHub Pages),
   * e.g. https://shop.sayadbayezid.com. Used for canonical URLs, sitemap and CORS.
   */
  PUBLIC_SITE_URL?: string;
  APP_ENV: 'production' | 'staging' | 'development' | 'test';
  /** 'live' | 'sandbox'. In sandbox NO Purchase event ever reaches the Meta pixel or CAPI. */
  PAYMENT_MODE: 'live' | 'sandbox';
  META_PIXEL_ID?: string;
  META_GRAPH_VERSION?: string;

  // secrets (wrangler secret put …) — never sent to the browser
  ADMIN_SETUP_TOKEN?: string;
  DATA_ENCRYPTION_KEY?: string; // base64, 32 bytes
  SESSION_SECRET?: string;
  META_CAPI_TOKEN?: string;
  SSLCOMMERZ_STORE_ID?: string;
  SSLCOMMERZ_STORE_PASSWORD?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SMS_API_URL?: string;
  SMS_API_KEY?: string;
  SMS_SENDER_ID?: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_TEMPLATE?: string;
  ADMIN_ALERT_EMAIL?: string;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export type AppBindings = { Bindings: Env; Variables: { admin: AdminUser; requestId: string } };
