import type { Env } from '../../env';

/**
 * SSLCommerz — one hosted checkout covering bKash, Nagad, Rocket, Upay,
 * Visa/Mastercard/Amex and internet banking for Bangladesh.
 * Docs: https://developer.sslcommerz.com/doc/v4/
 */
const base = (env: Env) => (env.PAYMENT_MODE === 'live' ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com');

export const sslcommerzConfigured = (env: Env) => !!(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD);

/** Preselect a channel on the hosted page. */
const CARD_HINT: Record<string, string> = { bkash: 'bkash', nagad: 'nagad', rocket: 'dbblmobilebanking', card: 'visacard,mastercard,amexcard' };

export interface SslInitInput {
  tranId: string;
  amount: number;
  method: string;
  customer: { name: string; email: string; phone: string };
  productName: string;
}

export async function sslcommerzInit(env: Env, input: SslInitInput): Promise<{ redirectUrl: string; sessionKey: string }> {
  const site = env.SITE_URL;
  const body = new URLSearchParams({
    store_id: env.SSLCOMMERZ_STORE_ID!,
    store_passwd: env.SSLCOMMERZ_STORE_PASSWORD!,
    total_amount: input.amount.toFixed(2),
    currency: 'BDT',
    tran_id: input.tranId,
    success_url: `${site}/payments/sslcommerz/return?r=success`,
    fail_url: `${site}/payments/sslcommerz/return?r=fail`,
    cancel_url: `${site}/payments/sslcommerz/return?r=cancel`,
    ipn_url: `${site}/api/payments/sslcommerz/ipn`,
    cus_name: input.customer.name,
    cus_email: input.customer.email || 'no-email@invalid.local',
    cus_phone: input.customer.phone,
    cus_add1: 'Bangladesh',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    shipping_method: 'NO',
    num_of_item: '1',
    product_name: input.productName.slice(0, 250),
    product_category: 'Web Development Service',
    product_profile: 'non-physical-goods',
    value_a: input.tranId,
  });
  if (CARD_HINT[input.method]) body.set('multi_card_name', CARD_HINT[input.method]);
  const res = await fetch(`${base(env)}/gwprocess/v4/api.php`, { method: 'POST', body });
  const json = (await res.json().catch(() => ({}))) as { status?: string; GatewayPageURL?: string; sessionkey?: string; failedreason?: string };
  if (json.status !== 'SUCCESS' || !json.GatewayPageURL) throw new Error(`sslcommerz_init_failed:${json.failedreason || res.status}`);
  return { redirectUrl: json.GatewayPageURL, sessionKey: json.sessionkey || '' };
}

export interface SslValidation {
  valid: boolean;
  tranId: string;
  valId: string;
  amount: number;
  currency: string;
  riskLevel: number;
  raw: Record<string, unknown>;
}

/** Server-to-server validation. Never trust the browser redirect or the IPN body alone. */
export async function sslcommerzValidate(env: Env, valId: string): Promise<SslValidation> {
  const url = `${base(env)}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(env.SSLCOMMERZ_STORE_ID!)}&store_passwd=${encodeURIComponent(env.SSLCOMMERZ_STORE_PASSWORD!)}&format=json`;
  const res = await fetch(url);
  const j = (await res.json().catch(() => ({}))) as Record<string, string>;
  const status = j.status || '';
  return {
    valid: status === 'VALID' || status === 'VALIDATED',
    tranId: j.tran_id || '',
    valId: j.val_id || valId,
    amount: Number(j.currency_amount || j.amount || 0),
    currency: j.currency_type || j.currency || '',
    riskLevel: Number(j.risk_level || 0),
    raw: { status, tran_id: j.tran_id, amount: j.amount, card_type: j.card_type, risk_level: j.risk_level, bank_tran_id: j.bank_tran_id },
  };
}
