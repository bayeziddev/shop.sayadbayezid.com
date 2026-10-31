import { $, api, esc, attribution, toast } from './lib.js';

let cfg = null;
let sessionId = sessionStorage.getItem('sb_chat_sid');
if (!sessionId) { sessionId = 'c' + crypto.randomUUID().replace(/-/g, ''); sessionStorage.setItem('sb_chat_sid', sessionId); }

function add(log, text, who) {
  const b = document.createElement('div');
  b.className = `bubble ${who}`;
  b.textContent = text;
  log.appendChild(b);
  log.scrollTop = log.scrollHeight;
  return b;
}

function handoffForm(log) {
  if (log.querySelector('.handoff')) return;
  const f = document.createElement('form');
  f.className = 'handoff';
  f.innerHTML = '<input name="name" required maxlength="100" placeholder="আপনার নাম"><input name="phone" required inputmode="tel" maxlength="20" placeholder="মোবাইল নম্বর"><button class="btn btn-primary btn-sm">প্রতিনিধির সাথে কথা বলতে চাই</button>';
  log.appendChild(f);
  log.scrollTop = log.scrollHeight;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/chat/handoff', { method: 'POST', body: { sessionId, name: f.name.value, phone: f.phone.value, attribution: attribution() } });
      window.SBTrack?.fire('Lead', { content_name: 'chat' }, r.eventId);
      f.replaceWith(Object.assign(document.createElement('div'), { className: 'bubble bot', textContent: 'ধন্যবাদ! আমাদের একজন প্রতিনিধি শীঘ্রই আপনার সাথে যোগাযোগ করবেন।' }));
    } catch (err) { toast(err.message, true); }
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
        const r = await api('/api/chat/ai', { method: 'POST', body: { sessionId, message: text } });
        typing.remove();
        add(log, r.answer, 'bot');
        if (r.escalate) handoffForm(log);
      } catch (err) {
        typing.remove();
        add(log, err.message, 'bot');
        handoffForm(log);
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
