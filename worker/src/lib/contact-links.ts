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
