import { $, $$, api, taka, bn, esc, setMsg, showFieldError, toast } from './lib.js';

const root = $('[data-portal]');
const no = decodeURIComponent(location.pathname.split('/').pop());
const token = new URLSearchParams(location.search).get('t') || '';
const base = `/api/portal/${encodeURIComponent(no)}`;
const call = (path, opts = {}) => api(base + path, { ...opts, headers: { 'x-portal-token': token } });
const date = (iso) => (iso ? new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'Asia/Dhaka' }).format(new Date(iso)) : '');

function field(f, v) {
  const val = esc(v || '');
  const req = f.required ? 'required' : '';
  if (f.type === 'textarea') return `<label>${esc(f.label)}${f.required ? ' *' : ''}<textarea name="${f.key}" rows="3" maxlength="${f.max}" ${req}>${val}</textarea></label>`;
  if (f.type === 'select') return `<label>${esc(f.label)}${f.required ? ' *' : ''}<select name="${f.key}" ${req}><option value="">বেছে নিন</option>${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  return `<label>${esc(f.label)}${f.required ? ' *' : ''}<input name="${f.key}" value="${val}" maxlength="${f.max}" ${req}></label>`;
}

function render(d) {
  const o = d.order;
  const idx = d.pipeline.findIndex((p) => p.key === o.projectStatus);
  const cancelled = o.projectStatus === 'cancelled';
  root.innerHTML = `
  <h1>প্রজেক্ট: ${esc(o.orderNumber)}</h1>
  <p class="muted">${esc(o.customerName)}${o.businessName ? ' · ' + esc(o.businessName) : ''} · মোট ${taka(o.total)} · পেমেন্ট: ${esc(o.paymentStatusLabel)}</p>
  <div class="portal-grid">
    <aside class="card">
      <h2>অগ্রগতি</h2>
      ${cancelled ? '<p class="notice">এই অর্ডারটি বাতিল করা হয়েছে।</p>' : `<ol class="timeline">${d.pipeline.map((p, i) => `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}">${esc(p.label)}</li>`).join('')}</ol>`}
      ${o.invoiceUrl ? `<a class="btn btn-ghost btn-block" href="${o.invoiceUrl}" target="_blank" rel="noopener">ইনভয়েস ডাউনলোড (${esc(o.invoiceNumber)})</a>` : `<a class="btn btn-primary btn-block" href="${o.orderUrl}">পেমেন্ট সম্পন্ন করুন</a>`}
      <h3 style="margin-top:1.2rem">অর্ডারকৃত</h3>
      <ul class="file-list">${d.items.map((i) => `<li><strong>${esc(i.name)}</strong> — ${taka(i.total)}${i.addons.length ? `<br><small class="muted">${i.addons.map((a) => esc(a.name) + (a.quantity > 1 ? ' × ' + bn(a.quantity) : '')).join(', ')}</small>` : ''}</li>`).join('')}</ul>
    </aside>
    <div class="portal-main">
      ${o.previewUrl ? `<div class="card"><h2>প্রিভিউ</h2><p>আপনার সাইটের প্রিভিউ তৈরি হয়েছে।</p><a class="btn btn-primary" href="${esc(o.previewUrl)}" target="_blank" rel="noopener">প্রিভিউ দেখুন ↗</a>
        ${d.canApprove || d.canRequestRevision ? `<form class="form" data-review-step style="margin-top:1rem"><label>আপনার মতামত<textarea name="body" rows="3" maxlength="4000" placeholder="যা পরিবর্তন করতে চান লিখুন…"></textarea></label>
          <div class="pkg-actions">${d.canApprove ? '<button class="btn btn-primary" data-kind="approval">সব ঠিক আছে — অনুমোদন দিচ্ছি</button>' : ''}${d.canRequestRevision ? '<button class="btn btn-ghost" data-kind="revision_request">সংশোধন চাই</button>' : ''}</div>
          <p class="form-msg" data-form-msg role="status"></p></form>` : ''}</div>` : ''}

      ${o.deliveryLinks.length || d.files.some((f) => f.kind === 'delivery') ? `<div class="card"><h2>ডেলিভারি</h2><ul class="file-list">
        ${o.deliveryLinks.map((l) => `<li>🔗 <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a></li>`).join('')}
        ${d.files.filter((f) => f.kind === 'delivery').map((f) => `<li>📦 <a href="${f.url}">${esc(f.filename)}</a></li>`).join('')}</ul></div>` : ''}

      <div class="card">
        <h2>প্রজেক্টের তথ্য</h2>
        ${d.requirements.locked ? '<p class="notice">পেমেন্ট নিশ্চিত হওয়ার পর এখানে আপনার ব্যবসার তথ্য জমা দিতে পারবেন।</p>' :
          d.requirements.editable ? `<p class="muted">${d.requirements.submittedAt ? 'জমা দেওয়া হয়েছে — ডেভেলপমেন্ট শুরুর আগ পর্যন্ত পরিবর্তন করতে পারবেন।' : 'কাজ শুরু করতে নিচের তথ্যগুলো দিন। আপনার তথ্য এনক্রিপ্ট করে সংরক্ষণ করা হয়।'}</p>
          <form class="form" data-req-form>${d.requirements.fields.map((f) => field(f, d.requirements.values?.[f.key])).join('')}
          <button class="btn btn-primary">${d.requirements.submittedAt ? 'হালনাগাদ করুন' : 'তথ্য জমা দিন'}</button><p class="form-msg" data-form-msg role="status"></p></form>` :
          `<dl class="kv">${d.requirements.fields.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(d.requirements.values?.[f.key] || '—')}</dd>`).join('')}</dl>`}
        ${!d.requirements.locked ? `<h3>ফাইল (লোগো, ছবি, লেখা)</h3>
          <ul class="file-list">${d.files.filter((f) => f.kind === 'requirement_asset').map((f) => `<li>📎 <a href="${f.url}">${esc(f.filename)}</a></li>`).join('') || '<li class="muted">এখনো কোনো ফাইল নেই</li>'}</ul>
          <form class="form" data-upload-form><input type="file" name="file" required accept="image/*,.pdf,.zip,.doc,.docx,.txt"><button class="btn btn-ghost btn-sm">আপলোড</button><p class="form-msg" data-form-msg role="status"></p></form>` : ''}
      </div>

      <div class="card">
        <h2>বার্তা</h2>
        <div class="msgs">${d.messages.map((m) => `<div class="msg ${m.author}">${esc(m.body)}<small>${m.author === 'client' ? 'আপনি' : 'আমাদের টিম'} · ${date(m.created_at)}</small></div>`).join('') || '<p class="muted">এখনো কোনো বার্তা নেই।</p>'}</div>
        ${o.paymentStatus === 'paid' ? '<form class="form" data-msg-form><textarea name="body" rows="2" maxlength="4000" required placeholder="আপনার বার্তা…"></textarea><button class="btn btn-ghost btn-sm">পাঠান</button></form>' : ''}
      </div>

      ${d.canReview ? `<form class="card form" data-rate-form><h2>আপনার অভিজ্ঞতা জানান</h2>
        <div class="rating-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="r${n}" value="${n}" required><label for="r${n}" title="${bn(n)}">★</label>`).join('')}</div>
        <label>রিভিউ<textarea name="body" rows="3" maxlength="2000" required></textarea></label>
        <button class="btn btn-primary">রিভিউ জমা দিন</button><p class="form-msg" data-form-msg role="status"></p></form>` : d.review ? '<div class="card"><p>আপনার রিভিউর জন্য ধন্যবাদ!</p></div>' : ''}

      ${d.referral ? `<div class="card"><h2>বন্ধুকে রেফার করুন</h2><p>এই কোড ব্যবহার করে আপনার পরিচিতরা ${bn(d.referral.percent)}% ছাড় পাবেন:</p><button class="coupon-chip" data-copy="${esc(d.referral.code)}">কোড: <strong>${esc(d.referral.code)}</strong></button></div>` : ''}
    </div>
  </div>`;
  bind();
}

function bind() {
  const req = $('[data-req-form]', root);
  req?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-form-msg]', req);
    const body = Object.fromEntries(new FormData(req));
    try { await call('/requirements', { method: 'POST', body }); toast('তথ্য জমা হয়েছে, ধন্যবাদ!'); load(); }
    catch (err) { showFieldError(req, err.code, err.message); setMsg(msg, err.message); }
  });
  const up = $('[data-upload-form]', root);
  up?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-form-msg]', up);
    const fd = new FormData(up);
    if (fd.get('file')?.size > 10 * 1024 * 1024) return setMsg(msg, 'ফাইলের আকার সর্বোচ্চ ১০ মেগাবাইট');
    setMsg(msg, 'আপলোড হচ্ছে…', true);
    try { await call('/upload', { method: 'POST', body: fd }); load(); } catch (err) { setMsg(msg, err.message); }
  });
  const rs = $('[data-review-step]', root);
  rs?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    e.preventDefault();
    const body = rs.body.value.trim();
    if (b.dataset.kind === 'revision_request' && !body) return setMsg($('[data-form-msg]', rs), 'কী সংশোধন চান লিখুন');
    if (b.dataset.kind === 'approval' && !confirm('প্রিভিউ অনুমোদন করলে প্রজেক্টটি ডেলিভারির ধাপে যাবে। নিশ্চিত?')) return;
    try { await call('/messages', { method: 'POST', body: { kind: b.dataset.kind, body } }); load(); } catch (err) { setMsg($('[data-form-msg]', rs), err.message); }
  });
  const mf = $('[data-msg-form]', root);
  mf?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await call('/messages', { method: 'POST', body: { body: mf.body.value } }); load(); } catch (err) { toast(err.message, true); }
  });
  const rf = $('[data-rate-form]', root);
  rf?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(rf));
    try { await call('/review', { method: 'POST', body: { rating: Number(fd.rating), body: fd.body } }); load(); } catch (err) { setMsg($('[data-form-msg]', rf), err.message); }
  });
}

async function load() {
  try { render(await call('')); } catch (err) { root.innerHTML = `<p class="form-msg is-error">${esc(err.message)}</p>`; }
}
load();
