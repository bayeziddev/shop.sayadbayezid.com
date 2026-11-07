import { $, api, esc, attribution, toast } from './lib.js';

let cfg = null;
let sessionId = sessionStorage.getItem('sb_chat_sid');
if (!sessionId) { sessionId = 'c' + crypto.randomUUID().replace(/-/g, ''); sessionStorage.setItem('sb_chat_sid', sessionId); }

/** Plain text with tappable links: https:// links open in a new tab, Bangladeshi mobile numbers dial. No HTML is ever parsed. */
function linkify(el, text) {
  const re = /(https?:\/\/[^\s<>"')]+)|((?:\+?88)?01[3-9]\d{8})/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) el.append(text.slice(last, m.index));
    const a = document.createElement('a');
    const url = m[1] ? m[1].replace(/[.,!?।]+$/, '') : '';
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = url; }
    else { a.href = `tel:${m[2]}`; a.textContent = m[2]; }
    el.append(a);
    last = m.index + (url || m[2]).length;
  }
  if (last < text.length) el.append(text.slice(last));
}

function add(log, text, who) {
  const b = document.createElement('div');
  b.className = `bubble ${who}`;
  if (who === 'bot') linkify(b, text); else b.textContent = text;
  log.appendChild(b);
  log.scrollTop = log.scrollHeight;
  return b;
}

function handoffForm(log, whatsapp) {
  if (log.querySelector('.handoff') || log.dataset.leadDone) return;
  const f = document.createElement('form');
  f.className = 'handoff';
  f.innerHTML = '<p class="handoff-title">নাম ও হোয়াটসঅ্যাপ নম্বর দিন — আমাদের টিম ফ্রি পরামর্শ ও ডেমো পাঠাবে</p>'
    + '<input name="name" required maxlength="100" autocomplete="name" placeholder="আপনার নাম">'
    + '<input name="phone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="হোয়াটসঅ্যাপ নম্বর (০১XXXXXXXXX)">'
    + '<button class="btn btn-primary btn-sm">যোগাযোগ করতে বলুন</button>'
    + (whatsapp ? '<a class="btn btn-ghost btn-sm handoff-wa" target="_blank" rel="noopener" data-wa>অথবা এখনই হোয়াটসঅ্যাপে লিখুন</a>' : '');
  if (whatsapp) f.querySelector('[data-wa]').href = whatsapp;
  log.appendChild(f);
  log.scrollTop = log.scrollHeight;
  f.querySelector('[data-wa]')?.addEventListener('click', () => window.SBTrack?.custom('ChatWhatsApp', { from: 'chat' }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('/api/chat/handoff', { method: 'POST', body: { sessionId, name: f.name.value, phone: f.phone.value, attribution: attribution() } });
      if (r.eventId) window.SBTrack?.fire('Lead', { content_name: 'chat' }, r.eventId);
      log.dataset.leadDone = '1';
      f.replaceWith(Object.assign(document.createElement('div'), { className: 'bubble bot', textContent: 'ধন্যবাদ! আমাদের টিম শীঘ্রই আপনার হোয়াটসঅ্যাপে যোগাযোগ করবে। এর মধ্যে আর কিছু জানতে চাইলে এখানেই লিখুন।' }));
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}

async function setup(root) {
  const panel = $('.chat-panel', root);
  if (!cfg) {
    try { cfg = await api('/api/chat/config'); } catch { cfg = { ai: false, whatsapp: null, messenger: null }; }
    const ai = $('[data-channel="ai"]', root);
    const wa = $('[data-channel="whatsapp"]', root);
    const ms = $('[data-channel="messenger"]', root);
    ai.hidden = !cfg.ai;
    if (cfg.whatsapp) { wa.href = cfg.whatsapp; wa.hidden = false; }
    if (cfg.messenger) { ms.href = cfg.messenger; ms.hidden = false; }
    if (!cfg.ai && !cfg.whatsapp && !cfg.messenger) $('[data-chat-picker]', root).innerHTML = '<p class="muted">চ্যাট এখন বন্ধ আছে। <a href="/contact">যোগাযোগ পেজ</a> থেকে বার্তা পাঠান।</p>';
    const log = $('[data-chat-log]', root);
    ai.addEventListener('click', () => {
      $('[data-chat-picker]', root).hidden = true;
      $('[data-chat-ai]', root).hidden = false;
      if (!log.childElementCount) add(log, cfg.greeting || 'আসসালামু আলাইকুম! কীভাবে সাহায্য করতে পারি?', 'bot');
      $('[data-chat-form] input', root).focus();
    });
    $('[data-chat-back]', root).addEventListener('click', () => { $('[data-chat-picker]', root).hidden = false; $('[data-chat-ai]', root).hidden = true; });
    $('[data-chat-close]', root).addEventListener('click', () => toggle(root, false));
    const form = $('[data-chat-form]', root);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = form.m.value.trim();
      if (!text) return;
      form.m.value = '';
      add(log, text, 'me');
      const typing = add(log, 'লিখছে…', 'bot typing');
      try {
        const r = await api('/api/chat/ai', { method: 'POST', body: { sessionId, message: text, attribution: attribution() } });
        typing.remove();
        add(log, r.answer, 'bot');
        if (r.leadEventId) {
          // The visitor typed their number in the chat: it is already a lead.
          window.SBTrack?.fire('Lead', { content_name: 'chat' }, r.leadEventId);
          log.dataset.leadDone = '1';
          log.querySelector('.handoff')?.remove();
        } else if (r.askLead) handoffForm(log, r.whatsapp || cfg.whatsapp);
      } catch (err) {
        typing.remove();
        add(log, err.message, 'bot');
        handoffForm(log, cfg.whatsapp);
      }
    });
  }
  return panel;
}

export async function toggle(root, force) {
  const panel = await setup(root);
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  $('[data-chat-open]', root).setAttribute('aria-expanded', String(open));
}
