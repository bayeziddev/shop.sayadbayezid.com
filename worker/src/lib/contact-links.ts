import { normalizeBdPhone } from './util';

/** Deep links for the chat launcher (no API key needed). */
export function whatsappLink(number: string, message: string): string {
  const n = (number || '').replace(/[^\d]/g, '').replace(/^0/, '880');
  if (!n) return '';
  return `https://wa.me/${n}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export function messengerLink(page: string): string {
  const p = (page || '').trim().replace(/^https?:\/\/(www\.)?(facebook\.com|m\.me)\//, '').replace(/\/$/, '');
  if (!p || !/^[\w.\-]+$/.test(p)) return '';
  return `https://m.me/${p}`;
}

/** A Bangladeshi mobile number typed anywhere in a chat message (Bangla or Latin digits, spaces or dashes allowed). */
export function phoneInText(text: string, exclude: string[] = []): string {
  const t = text.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
  for (const cand of t.match(/(?:\+?\s?88[\s-]?)?0\s?1[3-9](?:[\s-]?\d){8}/g) || []) {
    const p = normalizeBdPhone(cand);
    if (p && !exclude.includes(p)) return p;
  }
  return '';
}
/** "আমার নাম রহিম" / "নাম: Rahim" / "my name is Rahim" → the name. */
export function nameInText(text: string): string {
  const m = text.match(/(?:আমার নাম|নাম\s*[:：-]|my name is|i am|this is)\s*([^\d,।.!?\n:]{2,40})/i);
  return m ? m[1].replace(/\s+(এবং|আর|and|নম্বর|নাম্বার)$/i, '').trim() : '';
}
