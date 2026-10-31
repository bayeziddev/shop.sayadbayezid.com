import { $, $$, api, bn, taka, esc, fmtDate, toast, confirmDialog, slideOver, openForm, fieldHtml, readForm, bindMedia, setFieldError, listView, statusPill, can, state, toLocalInput, fromLocalInput } from './core.js';

const PS = () => state.lookups?.statuses || [];
const psLabel = (k) => PS().find((s) => s.key === k)?.label || k;
const PAY = { unpaid: ['পরিশোধ হয়নি', 'bad'], pending_verification: ['যাচাই প্রয়োজন', 'warn'], paid: ['পরিশোধিত', 'ok'], failed: ['ব্যর্থ', 'bad'], refunded: ['ফেরত', 'info'] };
export const payPill = (s) => statusPill(...(PAY[s] || [s]));
export const projPill = (s) => statusPill(psLabel(s), s === 'completed' ? 'ok' : s === 'cancelled' ? 'bad' : s === 'pending_payment' ? 'warn' : 'info');
const SRC = { quote: 'কোটেশন', chat: 'চ্যাট', quiz: 'কুইজ', landing: 'ল্যান্ডিং পেজ', contact: 'যোগাযোগ' };
const LEAD = { new: 'নতুন', contacted: 'যোগাযোগ হয়েছে', follow_up: 'ফলো-আপ', won: 'অর্ডার হয়েছে', lost: 'হারানো' };
export { SRC, LEAD };
const METHOD = { bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট', card: 'কার্ড', bank_transfer: 'ব্যাংক', stripe: 'আন্তর্জাতিক কার্ড', sslcommerz: 'এসএসএলকমার্জ' };
export { METHOD };
const waLink = (phone) => `https://wa.me/${String(phone).replace(/\D/g, '')}`;

/* ================= Dashboard ================= */
let chart;
export async function dashboard(root) {
  const d = await api('/dashboard');
  const k = d.kpi;
  const a = d.attention;
  root.innerHTML = `
  <div class="page-head"><h1>ড্যাশবোর্ড</h1><span class="muted small">${fmtDate(new Date().toISOString())}</span></div>
  <div class="health" aria-label="সংযোগের অবস্থা">${d.health.map((h) => `<span class="pill ${h.ok ? 'ok' : h.hint === 'ঐচ্ছিক' || h.hint.startsWith('ঐচ্ছিক') ? '' : 'warn'}" title="${esc(h.hint)}">${h.ok ? '✓' : '○'} ${esc(h.label)}: ${h.ok ? 'সংযুক্ত' : 'এখনো সংযুক্ত নয়'}</span>`).join('')}</div>
  ${d.onboarding && d.onboarding.some((s) => !s.done) ? `<div class="card onboard"><div style="display:flex;justify-content:space-between;gap:.5rem"><h2>শুরু করার ধাপ</h2>${can('settings.write') ? '<button class="btn sm" data-dismiss-onboard>লুকান</button>' : ''}</div>
    <ol>${d.onboarding.map((s) => `<li class="${s.done ? 'done' : ''}">${s.done ? esc(s.label) : `<a href="${s.link}">${esc(s.label)}</a>`}</li>`).join('')}</ol></div>` : ''}
  <h2>আজ যেগুলোতে আপনার নজর দরকার</h2>
  <div class="attention">
    <div class="card"><h3>নতুন লিড (${bn(a.newLeads.length)})</h3><ul>${a.newLeads.map((l) => `<li><a href="#/leads/${l.id}">${esc(l.name)}</a> <span class="muted small">${SRC[l.source] || l.source}</span>${can('leads.write') ? `<button class="btn sm" data-followed="${l.id}">ফলো-আপ হয়েছে</button>` : ''}</li>`).join('') || '<li class="muted">কিছু নেই 🎉</li>'}</ul></div>
    <div class="card"><h3>মানুষের সহায়তা চাওয়া চ্যাট (${bn(a.escalatedChats.length)})</h3><ul>${a.escalatedChats.map((c) => `<li><a href="#/chats">${esc(c.visitor_name || 'অজ্ঞাত দর্শনার্থী')}</a><span class="muted small">${fmtDate(c.updated_at)}</span></li>`).join('') || '<li class="muted">কিছু নেই</li>'}</ul></div>
    <div class="card"><h3>পেমেন্ট যাচাই বাকি (${bn(a.pendingPayments.length)})</h3><ul>${a.pendingPayments.map((o) => `<li><a href="#/orders/${o.id}">${esc(o.order_number)}</a> <span>${taka(o.total)}</span></li>`).join('') || '<li class="muted">কিছু নেই</li>'}</ul></div>
    <div class="card"><h3>অনেক দিন একই ধাপে আটকে আছে (${bn(a.stuckOrders.length)})</h3><ul>${a.stuckOrders.map((o) => `<li><a href="#/orders/${o.id}">${esc(o.order_number)}</a> ${projPill(o.project_status)}${can('orders.write') ? `<button class="btn sm" data-advance="${o.id}">পরের ধাপ</button>` : ''}</li>`).join('') || '<li class="muted">কিছু নেই</li>'}</ul></div>
    ${a.pendingReviews ? `<div class="card"><h3>অনুমোদনের অপেক্ষায় রিভিউ</h3><p><a href="#/reviews">${bn(a.pendingReviews)}টি রিভিউ দেখুন</a></p></div>` : ''}
  </div>
  <div class="kpis">
    <div class="kpi"><b>${bn(k.orders_today)}</b><span>আজকের অর্ডার</span></div>
    <div class="kpi"><b>${taka(k.revenue_today)}</b><span>আজকের আয়</span></div>
    <div class="kpi"><b>${taka(k.revenue_30d)}</b><span>গত ৩০ দিনের আয়</span></div>
    <div class="kpi"><b>${bn(k.leads_today)}</b><span>আজকের নতুন লিড</span></div>
    <div class="kpi"><b>${bn(k.active_chats)}</b><span>সক্রিয় চ্যাট</span></div>
    <div class="kpi"><b>${bn(k.awaiting_delivery)}</b><span>ডেলিভারির অপেক্ষায় প্রজেক্ট</span></div>
  </div>
  <div class="card" style="margin-bottom:1rem"><h2>বিক্রি — গত ৩০ দিন</h2><div class="chart-box"><canvas id="sales-chart" aria-label="বিক্রির চার্ট"></canvas></div></div>
  <div class="card"><h2>সাম্প্রতিক অর্ডার</h2><div class="table-wrap"><table><thead><tr><th>অর্ডার</th><th>ক্লায়েন্ট</th><th>মোট</th><th>পেমেন্ট</th><th>প্রজেক্ট</th><th>তারিখ</th></tr></thead><tbody>
    ${d.recentOrders.map((o) => `<tr><td><a href="#/orders/${o.id}">${esc(o.order_number)}</a></td><td>${esc(o.customer_name)}</td><td>${taka(o.total)}</td><td>${payPill(o.payment_status)}</td><td>${projPill(o.project_status)}</td><td class="small">${fmtDate(o.created_at)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">এখনো কোনো অর্ডার নেই</td></tr>'}
  </tbody></table></div></div>`;

  // Chart.js (vendored, loaded with defer)
  const days = [];
  for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() + 6 * 3600000 - i * 86400000).toISOString().slice(0, 10));
  const byDay = Object.fromEntries(d.chart.map((r) => [r.day, r]));
  const draw = () => {
    if (!window.Chart) return setTimeout(draw, 100);
    chart?.destroy();
    const css = getComputedStyle(document.documentElement);
    chart = new window.Chart($('#sales-chart'), {
      type: 'bar',
      data: { labels: days.map((x) => bn(x.slice(8)) + '/' + bn(x.slice(5, 7))), datasets: [
        { type: 'line', label: 'আয় (৳)', data: days.map((x) => byDay[x]?.revenue || 0), borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,.2)', fill: true, tension: .35, yAxisID: 'y' },
        { type: 'bar', label: 'অর্ডার', data: days.map((x) => byDay[x]?.orders || 0), backgroundColor: 'rgba(59,130,246,.55)', borderRadius: 4, yAxisID: 'y1' },
      ] },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: css.getPropertyValue('--muted') } } }, scales: { x: { ticks: { color: css.getPropertyValue('--muted') }, grid: { display: false } }, y: { ticks: { color: css.getPropertyValue('--muted'), callback: (v) => '৳' + bn(v) } }, y1: { position: 'right', grid: { display: false }, ticks: { color: css.getPropertyValue('--muted'), precision: 0, callback: (v) => bn(v) } } } },
    });
  };
  draw();

  root.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-followed]');
    if (f) { await api(`/leads/${f.dataset.followed}/followed-up`, { method: 'POST', body: {} }); toast('ফলো-আপ চিহ্নিত হয়েছে'); f.closest('li').remove(); }
    const adv = e.target.closest('[data-advance]');
    if (adv) openOrder(Number(adv.dataset.advance));
    if (e.target.closest('[data-dismiss-onboard]')) { await api('/settings', { method: 'PUT', body: { onboarding_dismissed: true } }); dashboard(root); }
  });
}

/* ================= Orders ================= */
export function ordersView(root) {
  return listView(root, {
    title: 'অর্ডার ও প্রজেক্ট', endpoint: '/orders', exportUrl: '/orders/export.csv', allowCreate: false, allowDelete: false, titleKey: 'order_number',
    filters: [
      { name: 'project_status', label: 'প্রজেক্ট', options: () => PS().map((s) => [s.key, s.label]) },
      { name: 'payment_status', label: 'পেমেন্ট', options: Object.entries(PAY).map(([k, v]) => [k, v[0]]) },
    ],
    columns: [
      { label: 'অর্ডার', render: (o) => `<a href="#/orders/${o.id}">${esc(o.order_number)}</a>${o.invoice_number ? `<br><span class="muted small">${esc(o.invoice_number)}</span>` : ''}` },
      { label: 'ক্লায়েন্ট', render: (o) => `${esc(o.customer_name)}<br><span class="muted small">${esc(o.customer_phone)}</span>` },
      { label: 'মোট', render: (o) => taka(o.total) },
      { label: 'পেমেন্ট', render: (o) => `${payPill(o.payment_status)}<br><span class="muted small">${METHOD[o.payment_method] || esc(o.payment_method)}</span>` },
      { label: 'প্রজেক্ট', render: (o) => projPill(o.project_status) },
      { label: 'উৎস', render: (o) => `<span class="small">${esc(o.utm_source || 'সরাসরি')}${o.utm_campaign ? ' / ' + esc(o.utm_campaign) : ''}</span>` },
      { label: 'তারিখ', render: (o) => `<span class="small">${fmtDate(o.created_at)}</span>` },
    ],
    onOpen: (o, reload) => openOrder(o.id, reload),
  });
}

export async function openOrder(id, reload) {
  const so = slideOver('অর্ডার / প্রজেক্ট', { wide: true });
  const render = async () => {
    const d = await api(`/orders/${id}`);
    const o = d.order;
    const pipeline = PS().filter((s) => s.key !== 'cancelled');
    const curIdx = pipeline.findIndex((s) => s.key === o.project_status);
    so.body.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
        <div><h2 style="margin:0">${esc(o.order_number)} ${o.invoice_number ? `<span class="muted small">· ${esc(o.invoice_number)}</span>` : ''}</h2><div>${payPill(o.payment_status)} ${projPill(o.project_status)}</div></div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap"><a class="btn sm" href="${d.invoiceUrl}" target="_blank" rel="noopener">ইনভয়েস</a><a class="btn sm" href="${d.portalUrl}" target="_blank" rel="noopener">ক্লায়েন্ট পোর্টাল</a><a class="btn sm" href="${waLink(o.customer_phone)}" target="_blank" rel="noopener">হোয়াটসঅ্যাপ</a></div>
      </div>
      <div class="pipeline">${pipeline.map((s, i) => `<span class="${i < curIdx ? 'done' : i === curIdx ? 'cur' : ''}">${esc(s.label)}</span>`).join('')}</div>
      ${can('orders.write') && d.nextStatuses.length ? `<div class="card"><h3>পরের ধাপে নিন</h3><div style="display:flex;gap:.4rem;flex-wrap:wrap">${d.nextStatuses.map((s) => `<button class="btn ${s === 'cancelled' ? 'danger' : 'primary'} sm" data-status="${s}">${esc(psLabel(s))}</button>`).join('')}</div><label style="margin-top:.6rem">নোট (ক্লায়েন্টকে পাঠানো হবে, ঐচ্ছিক)<input data-status-note maxlength="500"></label></div>` : ''}
      ${o.payment_status === 'pending_verification' || (o.payment_status !== 'paid' && o.project_status !== 'cancelled' && ['bank_transfer', 'bkash', 'nagad', 'rocket'].includes(o.payment_method)) ? `<div class="card draft"><h3>পেমেন্ট যাচাই</h3>
        <dl class="kv"><dt>মাধ্যম</dt><dd>${METHOD[o.payment_method] || esc(o.payment_method)}</dd><dt>ট্রানজেকশন আইডি</dt><dd>${esc(o.manual_trx_id || '—')}</dd><dt>প্রেরক</dt><dd>${esc(o.manual_sender || '—')}</dd><dt>প্রত্যাশিত</dt><dd>${taka(o.total)}</dd></dl>
        ${can('orders.payment') ? `<p class="small muted">শুধু ব্যাংক/মোবাইল স্টেটমেন্টে টাকা আসলেই জমা হয়েছে দেখে নিশ্চিত করুন — এটি নিশ্চিত করলেই ইনভয়েস তৈরি হবে ও বিজ্ঞাপনের “পারচেজ” ইভেন্ট যাবে।</p>
          <div class="grid g2"><label>প্রাপ্ত টাকা<input type="number" data-paid-amount value="${o.total}" min="0"></label><label class="chk" style="align-self:end"><input type="checkbox" data-paid-confirm> আমি স্টেটমেন্টে টাকা জমা দেখেছি</label></div>
          <div style="display:flex;gap:.4rem;margin-top:.5rem"><button class="btn primary sm" data-verify>পেমেন্ট নিশ্চিত করুন</button>${o.payment_status === 'pending_verification' ? '<button class="btn danger sm" data-reject>প্রত্যাখ্যান</button>' : ''}</div>` : ''}</div>` : ''}
      <div class="grid g2">
        <div class="card"><h3>ক্লায়েন্ট</h3><dl class="kv"><dt>নাম</dt><dd>${esc(o.customer_name)}</dd><dt>ফোন</dt><dd><a href="tel:+${esc(o.customer_phone)}">${esc(o.customer_phone)}</a></dd><dt>ইমেইল</dt><dd>${esc(o.customer_email || '—')}</dd><dt>ব্যবসা</dt><dd>${esc(o.business_name || '—')}</dd><dt>উৎস</dt><dd class="small">${esc([o.utm_source, o.utm_medium, o.utm_campaign, o.utm_content].filter(Boolean).join(' / ') || 'সরাসরি')}</dd></dl></div>
        <div class="card"><h3>মূল্য</h3><dl class="kv">${d.items.map((i) => `<dt>${esc(i.package_name)}</dt><dd>${taka(i.total)}${i.addons.length ? `<br><span class="small muted">${i.addons.map((a) => esc(a.name) + (a.quantity > 1 ? ' × ' + bn(a.quantity) : '')).join(', ')}</span>` : ''}</dd>`).join('')}
          ${o.offer_discount ? `<dt>অফার ছাড়</dt><dd>−${taka(o.offer_discount)}</dd>` : ''}${o.coupon_discount ? `<dt>কুপন ${esc(o.coupon_code)}</dt><dd>−${taka(o.coupon_discount)}</dd>` : ''}<dt>সর্বমোট</dt><dd><b>${taka(o.total)}</b></dd>${o.paid_at ? `<dt>পরিশোধ</dt><dd>${fmtDate(o.paid_at)}</dd>` : ''}</dl></div>
      </div>
      <div class="card"><h3>ক্লায়েন্টের প্রজেক্ট তথ্য</h3>${d.requirementsSubmitted ? `<p class="small muted">জমা: ${fmtDate(d.requirementsSubmitted.submitted_at)}</p>${can('requirements.read') ? '<button class="btn sm" data-req>তথ্য দেখুন (অডিট লগে রেকর্ড হবে)</button><div data-req-box></div>' : '<p class="muted">দেখার অনুমতি নেই</p>'}` : '<p class="muted">এখনো জমা দেননি।</p>'}
        <h3 style="margin-top:.8rem">ক্লায়েন্টের ফাইল</h3><ul>${d.files.filter((f) => f.kind === 'requirement_asset').map((f) => `<li><a href="/api/admin/orders/${id}/files/${f.id}">${esc(f.filename)}</a></li>`).join('') || '<li class="muted">নেই</li>'}</ul></div>
      ${can('orders.write') ? `<div class="card"><h3>প্রিভিউ ও ডেলিভারি</h3>
        <form class="grid" data-delivery><label>প্রিভিউ লিংক <small>ক্লায়েন্ট রিভিউ ধাপে দেখানো হবে</small><input name="preview_url" value="${esc(o.preview_url)}" placeholder="https://"></label>
        <label>ডেলিভারি লিংক <small>প্রতি লাইনে: লেবেল | https://লিংক</small><textarea name="links" rows="3">${esc(o.delivery_links.map((l) => `${l.label} | ${l.url}`).join('\n'))}</textarea></label>
        <label>অভ্যন্তরীণ নোট <small>ক্লায়েন্ট দেখবেন না</small><textarea name="internal_notes" rows="3">${esc(o.internal_notes)}</textarea></label>
        <button class="btn primary sm" style="width:max-content">সংরক্ষণ</button></form>
        <h3 style="margin-top:.8rem">ডেলিভারি ফাইল</h3><ul>${d.files.filter((f) => f.kind === 'delivery').map((f) => `<li><a href="/api/admin/orders/${id}/files/${f.id}">${esc(f.filename)}</a> <button class="btn sm danger" data-del-file="${f.id}">মুছুন</button></li>`).join('') || '<li class="muted">নেই</li>'}</ul>
        <label class="btn sm" style="width:max-content">ফাইল আপলোড<input type="file" data-upload-delivery hidden></label></div>` : ''}
      <div class="card"><h3>ক্লায়েন্টের সাথে বার্তা</h3><div class="thread">${d.messages.map((m) => `<div class="m ${m.author}">${m.kind !== 'message' ? `<b>${m.kind === 'approval' ? '✓ অনুমোদন' : '↺ সংশোধনের অনুরোধ'}</b><br>` : ''}${esc(m.body)}<small>${m.author === 'client' ? 'ক্লায়েন্ট' : esc(m.admin_name || 'টিম')} · ${fmtDate(m.created_at)}</small></div>`).join('') || '<p class="muted">কোনো বার্তা নেই</p>'}</div>
        ${can('orders.write') ? '<form data-msg style="display:flex;gap:.4rem;margin-top:.5rem"><input name="body" required placeholder="ক্লায়েন্টকে বার্তা…"><button class="btn sm">পাঠান</button></form>' : ''}</div>
      <div class="card"><h3>ইতিহাস</h3><ul>${d.history.map((h) => `<li>${fmtDate(h.created_at)} — ${esc(psLabel(h.to_status))}${h.note ? ` <span class="muted">(${esc(h.note)})</span>` : ''} <span class="muted small">${esc(h.actor)}</span></li>`).join('')}</ul></div>`;
  };
  so.body.addEventListener('click', async (e) => {
    try {
      const s = e.target.closest('[data-status]');
      if (s) {
        if (s.dataset.status === 'cancelled' && !(await confirmDialog('অর্ডারটি বাতিল করবেন?', 'বাতিল করুন'))) return;
        await api(`/orders/${id}/status`, { method: 'POST', body: { status: s.dataset.status, note: $('[data-status-note]', so.body)?.value || '' } });
        toast('অবস্থা হালনাগাদ হয়েছে — ক্লায়েন্টকে জানানো হয়েছে'); await render(); reload?.();
      }
      if (e.target.closest('[data-verify]')) {
        await api(`/orders/${id}/verify-payment`, { method: 'POST', body: { amount: Number($('[data-paid-amount]', so.body).value), confirm: $('[data-paid-confirm]', so.body).checked } });
        toast('পেমেন্ট নিশ্চিত হয়েছে'); await render(); reload?.();
      }
      if (e.target.closest('[data-reject]') && (await confirmDialog('এই পেমেন্ট প্রত্যাখ্যান করবেন?', 'প্রত্যাখ্যান'))) { await api(`/orders/${id}/reject-payment`, { method: 'POST', body: {} }); await render(); }
      if (e.target.closest('[data-req]')) {
        const r = await api(`/orders/${id}/requirements`);
        $('[data-req-box]', so.body).innerHTML = `<dl class="kv" style="margin-top:.6rem">${r.fields.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(r.values[f.key] || '—')}</dd>`).join('')}</dl>`;
      }
      const df = e.target.closest('[data-del-file]');
      if (df && (await confirmDialog('ফাইলটি মুছবেন?'))) { await api(`/orders/${id}/files/${df.dataset.delFile}`, { method: 'DELETE' }); await render(); }
    } catch (err) { toast(err.message, true); }
  });
  so.body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.matches('[data-delivery]')) {
        const links = f.links.value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p.length === 2 || /^https?:/.test(p[0])).map((p) => (p.length === 2 ? { label: p[0], url: p[1] } : { label: p[0], url: p[0] }));
        await api(`/orders/${id}`, { method: 'PUT', body: { preview_url: f.preview_url.value, delivery_links: links, internal_notes: f.internal_notes.value } });
        toast('সংরক্ষিত হয়েছে');
      }
      if (f.matches('[data-msg]')) { await api(`/orders/${id}/messages`, { method: 'POST', body: { body: f.body.value } }); await render(); }
    } catch (err) { toast(err.message, true); }
  });
  so.body.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-upload-delivery]')) return;
    const fd = new FormData();
    fd.append('file', e.target.files[0]);
    try { await api(`/orders/${id}/files`, { method: 'POST', body: fd }); toast('আপলোড সম্পন্ন'); await render(); } catch (err) { toast(err.message, true); }
  });
  try { await render(); } catch (err) { so.body.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

/* ================= Leads ================= */
export function leadsView(root) {
  return listView(root, {
    title: 'লিড', endpoint: '/leads', exportUrl: '/leads/export.csv', allowCreate: false, writePerm: 'leads.write',
    intro: 'কোটেশন, চ্যাট, কুইজ ও ল্যান্ডিং পেজ থেকে আসা যোগাযোগ যারা এখনো কেনেননি।',
    defaultFilters: { status: '' },
    filters: [{ name: 'status', label: 'অবস্থা', options: Object.entries(LEAD) }, { name: 'source', label: 'উৎস', options: Object.entries(SRC) }],
    columns: [
      { label: 'নাম', render: (l) => `<a href="#/leads/${l.id}">${esc(l.name)}</a><br><span class="muted small">${esc(l.phone)}</span>` },
      { label: 'উৎস', render: (l) => esc(SRC[l.source] || l.source) },
      { label: 'বার্তা', render: (l) => `<span class="small">${esc((l.message || '').slice(0, 90))}</span>` },
      { label: 'অবস্থা', render: (l) => statusPill(LEAD[l.status] || l.status, l.status === 'won' ? 'ok' : l.status === 'lost' ? 'bad' : l.status === 'new' ? 'warn' : 'info') },
      { label: 'ক্যাম্পেইন', render: (l) => `<span class="small">${esc(l.utm_campaign || '—')}</span>` },
      { label: 'তারিখ', render: (l) => `<span class="small">${fmtDate(l.created_at)}</span>` },
    ],
    rowActions: [{ key: 'fu', label: 'ফলো-আপ হয়েছে', perm: 'leads.write', show: (l) => l.status === 'new' || l.status === 'follow_up', run: async (l, reload) => { await api(`/leads/${l.id}/followed-up`, { method: 'POST', body: {} }); toast('চিহ্নিত হয়েছে'); reload(); } }],
    onOpen: (l, reload) => openLead(l.id, reload),
  });
}

export async function openLead(id, reload) {
  const l = await api(`/leads/${id}`);
  const fields = [
    { name: 'status', label: 'অবস্থা', type: 'select', options: Object.entries(LEAD), required: true },
    { name: 'next_follow_up_at', label: 'পরবর্তী ফলো-আপ', type: 'datetime' },
    { name: 'notes', label: 'নোট', type: 'textarea', rows: 5 },
  ];
  openForm({
    title: `লিড: ${l.name}`,
    fields,
    values: l,
    extra: `<div class="card"><dl class="kv"><dt>ফোন</dt><dd><a href="tel:+${esc(l.phone)}">${esc(l.phone)}</a> · <a href="${waLink(l.phone)}" target="_blank" rel="noopener">হোয়াটসঅ্যাপ</a></dd><dt>ইমেইল</dt><dd>${esc(l.email || '—')}</dd><dt>ব্যবসা</dt><dd>${esc(l.business_name || '—')}</dd><dt>উৎস</dt><dd>${esc(SRC[l.source])}</dd>${l.package_name ? `<dt>প্যাকেজ</dt><dd>${esc(l.package_name)}</dd>` : ''}<dt>ক্যাম্পেইন</dt><dd>${esc([l.utm_source, l.utm_campaign, l.utm_content].filter(Boolean).join(' / ') || '—')}</dd><dt>স্বয়ংক্রিয় ফলো-আপ</dt><dd>${bn(l.auto_followups_sent)}টি পাঠানো হয়েছে</dd></dl><p style="white-space:pre-wrap;margin-top:.6rem">${esc(l.message)}</p>${l.quiz_result ? `<p class="small muted">কুইজ: ${esc(l.quiz_result)}</p>` : ''}</div>`,
    onSubmit: async (data) => { await api(`/leads/${id}`, { method: 'PUT', body: data }); reload?.(); },
  });
}

/* ================= Package editor (with add-ons, offers & AI draft) ================= */
export async function packageEditor(root, id) {
  const isNew = id === 'new';
  const p = isNew ? { status: 'active', tier: 'basic', images: '[]', features: '[]', base_price: 0, delivery_days: 7 } : await api(`/packages/${id}`);
  const cats = state.lookups.categories.map((c) => [c.id, c.name]);
  const fields = [
    { name: 'category_id', label: 'ক্যাটাগরি', type: 'select', options: cats, required: true, numeric: true },
    { name: 'name', label: 'প্যাকেজের নাম', required: true, max: 150 },
    { name: 'slug', label: 'স্লাগ (ইউআরএল)', required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*', hint: 'ছোট হাতের ইংরেজি অক্ষর ও হাইফেন, যেমন fashion-premium' },
    { name: 'tier', label: 'স্তর', type: 'select', options: [['basic', 'বেসিক'], ['premium', 'প্রিমিয়াম'], ['custom', 'কাস্টম']], required: true },
    { name: 'base_price', label: 'মূল দাম (৳)', type: 'number', min: 0, required: true },
    { name: 'delivery_days', label: 'ডেলিভারি (কর্মদিবস)', type: 'number', min: 1 },
    { name: 'status', label: 'অবস্থা', type: 'select', options: [['active', 'সক্রিয়'], ['inactive', 'নিষ্ক্রিয়'], ['coming_soon', 'শীঘ্রই আসছে']], required: true },
    { name: 'demo_url', label: 'লাইভ ডেমো লিংক', inputType: 'url', placeholder: 'https://' },
    { name: 'short_description', label: 'সংক্ষিপ্ত বিবরণ', type: 'textarea', rows: 2, max: 300 },
    { name: 'description', label: 'বিস্তারিত বিবরণ', type: 'textarea', rows: 7, max: 8000 },
    { name: 'features', label: 'ফিচার তালিকা', type: 'list' },
    { name: 'images', label: 'স্ক্রিনশট', type: 'images' },
    { name: 'demo_video_key', label: 'ডেমো ভিডিও (ছোট স্ক্রিন রেকর্ডিং, এমপি৪/ওয়েবএম)', type: 'image', accept: 'video/mp4,video/webm' },
    { name: 'is_featured', label: 'হোমপেজে দেখান', type: 'bool' },
    { name: 'sort_order', label: 'ক্রম', type: 'number' },
  ];
  const draft = p.ai_draft ? JSON.parse(p.ai_draft) : null;
  const writable = can('catalog.write');
  root.innerHTML = `
    <div class="page-head"><h1>${isNew ? 'নতুন প্যাকেজ' : esc(p.name)}</h1><div class="actions"><a class="btn" href="#/packages">← সব প্যাকেজ</a>${!isNew ? `<a class="btn" href="/package/${esc(p.slug)}" target="_blank" rel="noopener">সাইটে দেখুন</a>` : ''}</div></div>
    ${draft ? `<div class="card draft" data-draft><h2>এআই খসড়া — পর্যালোচনা প্রয়োজন</h2><p class="small muted">এটি এখনো সাইটে প্রকাশিত হয়নি। সম্পাদনা করে অনুমোদন দিলে তবেই লাইভ হবে।</p>
      <div class="grid"><label>শিরোনাম<input data-d="name" value="${esc(draft.title)}"></label><label>সংক্ষিপ্ত বিবরণ<textarea data-d="short_description" rows="2">${esc(draft.shortDescription)}</textarea></label><label>বিস্তারিত<textarea data-d="description" rows="6">${esc(draft.description)}</textarea></label></div>
      ${writable ? '<div style="display:flex;gap:.5rem;margin-top:.6rem"><button class="btn primary" data-approve>অনুমোদন দিয়ে প্রকাশ করুন</button><button class="btn danger" data-discard>বাতিল</button></div>' : ''}</div>` : ''}
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start">
      <form class="card grid" data-pkg>${fields.map((f) => fieldHtml(f, p[f.name])).join('')}
        ${writable ? `<div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn primary">সংরক্ষণ করুন</button>${can('ai.use') ? '<button class="btn" type="button" data-suggest>✨ এআই দিয়ে শিরোনাম ও বিবরণ সাজেস্ট করুন</button>' : ''}</div>` : ''}</form>
      <div class="grid">${isNew ? '<div class="card muted">প্রথমে সংরক্ষণ করুন, তারপর অ্যাড-অন ও অফার যোগ করা যাবে।</div>' : '<div class="card" data-addons></div><div class="card" data-offers></div><div class="card"><h3>এই প্যাকেজের প্রশ্নোত্তর</h3><a href="#/faqs">প্রশ্নোত্তর পাতা থেকে “প্যাকেজ” হিসেবে যোগ করুন →</a></div>'}</div>
    </div>`;
  const form = $('[data-pkg]', root);
  bindMedia(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFieldError(form);
    const data = readForm(form, fields);
    try {
      if (isNew) { const r = await api('/packages', { method: 'POST', body: data }); toast('প্যাকেজ তৈরি হয়েছে'); location.hash = `#/packages/${r.id}`; }
      else { await api(`/packages/${id}`, { method: 'PUT', body: data }); toast('সংরক্ষিত হয়েছে'); }
    } catch (err) { setFieldError(form, err.code, err.message); toast(err.message, true); }
  });
  $('[data-suggest]', root)?.addEventListener('click', async (e) => {
    const data = readForm(form, fields);
    e.target.disabled = true;
    e.target.textContent = 'তৈরি হচ্ছে…';
    try {
      await api('/ai/suggest', { method: 'POST', body: { packageId: isNew ? undefined : Number(id), name: data.name, features: data.features } });
      toast('খসড়া তৈরি হয়েছে — পর্যালোচনা করুন');
      if (!isNew) packageEditor(root, id);
    } catch (err) { toast(err.message, true); }
    e.target.disabled = false;
  });
  $('[data-approve]', root)?.addEventListener('click', async () => {
    const body = Object.fromEntries($$('[data-d]', root).map((el) => [el.dataset.d, el.value]));
    try { await api(`/packages/${id}/approve-draft`, { method: 'POST', body }); toast('অনুমোদিত ও প্রকাশিত'); packageEditor(root, id); } catch (err) { toast(err.message, true); }
  });
  $('[data-discard]', root)?.addEventListener('click', async () => { await api(`/packages/${id}/discard-draft`, { method: 'POST', body: {} }); packageEditor(root, id); });

  if (!isNew) {
    const addonFields = [
      { name: 'name', label: 'নাম', required: true, max: 120 }, { name: 'description', label: 'বিবরণ', max: 300 },
      { name: 'price_delta', label: 'অতিরিক্ত দাম (৳)', type: 'number', min: 0, required: true }, { name: 'max_quantity', label: 'সর্বোচ্চ সংখ্যা (১ = চালু/বন্ধ)', type: 'number', min: 1, default: 1 },
      { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 }, { name: 'sort_order', label: 'ক্রম', type: 'number', default: 0 },
    ];
    await listView($('[data-addons]', root), {
      title: 'অ্যাড-অন', singular: 'অ্যাড-অন', endpoint: '/addons', defaultFilters: { package_id: id }, search: false, writePerm: 'catalog.write', perPage: 50,
      fields: addonFields, newValues: { is_active: 1, max_quantity: 1 }, toApi: (d) => ({ ...d, package_id: Number(id) }),
      columns: [{ label: 'নাম', key: 'name' }, { label: 'দাম', render: (a) => '+' + taka(a.price_delta) + (a.max_quantity > 1 ? ` <span class="muted small">(সর্বোচ্চ ${bn(a.max_quantity)})</span>` : '') }, { label: '', render: (a) => (a.is_active ? '' : statusPill('বন্ধ', 'bad')) }],
    });
    await listView($('[data-offers]', root), offerListCfg('package', Number(id)));
  }
}

export function offerFields() {
  return [
    { name: 'title', label: 'অফারের শিরোনাম', max: 150, placeholder: 'যেমন: ঈদ অফার' },
    { name: 'discount_type', label: 'ছাড়ের ধরন', type: 'select', options: [['percent', 'শতকরা (%)'], ['flat', 'নির্দিষ্ট টাকা (৳)']], required: true },
    { name: 'discount_value', label: 'ছাড়ের পরিমাণ', type: 'number', min: 1, required: true },
    { name: 'starts_at', label: 'শুরু', type: 'datetime' },
    { name: 'ends_at', label: 'শেষ (এই সময়ের পর ছাড় স্বয়ংক্রিয়ভাবে বন্ধ)', type: 'datetime' },
    { name: 'show_timer', label: 'কাউন্টডাউন টাইমার দেখান', type: 'bool', default: 1 },
    { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 },
  ];
}
export function offerListCfg(scope, scopeId) {
  return {
    title: 'অফার ও টাইমার', singular: 'অফার', endpoint: '/offers', defaultFilters: { scope, scope_id: scopeId }, search: false, writePerm: 'marketing.write', titleKey: 'title',
    fields: offerFields(), newValues: { discount_type: 'percent', show_timer: 1, is_active: 1 }, toApi: (d) => ({ ...d, scope, scope_id: scopeId }),
    columns: [
      { label: 'অফার', render: (o) => `${esc(o.title || '—')}<br><b>${o.discount_type === 'percent' ? bn(o.discount_value) + '%' : taka(o.discount_value)}</b>` },
      { label: 'সময়', render: (o) => { const now = new Date().toISOString(); const live = o.is_active && (!o.starts_at || o.starts_at <= now) && (!o.ends_at || o.ends_at > now); return `${live ? statusPill('চলছে', 'ok') : statusPill(o.ends_at && o.ends_at <= now ? 'শেষ' : 'চলছে না', 'bad')}<br><span class="small muted">${o.ends_at ? 'শেষ ' + fmtDate(o.ends_at) : 'সময়সীমা নেই'}</span>`; } },
    ],
  };
}

/* ================= Landing page builder ================= */
const BLOCKS = {
  hero: { label: 'হিরো', fields: [['heading', 'শিরোনাম'], ['subheading', 'উপশিরোনাম', 'textarea'], ['ctaLabel', 'বোতামের লেখা'], ['ctaHref', 'বোতামের লিংক (খালি = ফর্মে যাবে)'], ['image', 'ছবি', 'image']] },
  offer: { label: 'অফার + টাইমার', fields: [['title', 'শিরোনাম'], ['text', 'লেখা', 'textarea'], ['endsAt', 'অফার শেষ', 'datetime'], ['couponCode', 'কুপন কোড']] },
  features: { label: 'ফিচার তালিকা', fields: [['title', 'শিরোনাম'], ['items', 'ফিচার (প্রতি লাইনে একটি)', 'list']] },
  packages: { label: 'প্যাকেজ কার্ড', fields: [['title', 'শিরোনাম'], ['categorySlug', 'ক্যাটাগরি স্লাগ (ঐচ্ছিক)'], ['packageSlugs', 'প্যাকেজ স্লাগ (প্রতি লাইনে একটি, ঐচ্ছিক)', 'list']] },
  testimonials: { label: 'ক্লায়েন্ট রিভিউ', fields: [['title', 'শিরোনাম']] },
  faq: { label: 'প্রশ্নোত্তর', fields: [['title', 'শিরোনাম'], ['items', 'প্রশ্ন | উত্তর (প্রতি লাইনে একটি)', 'qa']] },
  cta: { label: 'কল-টু-অ্যাকশন', fields: [['heading', 'শিরোনাম'], ['text', 'লেখা'], ['ctaLabel', 'বোতামের লেখা'], ['ctaHref', 'বোতামের লিংক']] },
  lead_form: { label: 'লিড ফর্ম', fields: [['title', 'ফর্মের শিরোনাম']] },
  text: { label: 'লেখা', fields: [['heading', 'শিরোনাম'], ['body', 'লেখা', 'textarea']] },
  video: { label: 'ভিডিও', fields: [['src', 'ভিডিও', 'video'], ['caption', 'ক্যাপশন']] },
};

export async function landingEditor(root, id) {
  const isNew = id === 'new';
  const lp = isNew ? { status: 'draft', blocks: '[]', title: '', slug: '' } : await api(`/landing-pages/${id}`);
  let blocks = JSON.parse(lp.blocks || '[]');
  const meta = [
    { name: 'title', label: 'পেজের নাম', required: true }, { name: 'slug', label: 'স্লাগ', required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*', hint: '/lp/স্লাগ' },
    { name: 'seo_title', label: 'এসইও শিরোনাম' }, { name: 'seo_description', label: 'এসইও বিবরণ', type: 'textarea', rows: 2 },
    { name: 'utm_source', label: 'ইউটিএম সোর্স', placeholder: 'facebook' }, { name: 'utm_medium', label: 'ইউটিএম মিডিয়াম', placeholder: 'paid_social' }, { name: 'utm_campaign', label: 'ইউটিএম ক্যাম্পেইন' },
  ];
  const blockHtml = (b, i) => {
    const def = BLOCKS[b.type];
    return `<div class="block-item" data-i="${i}"><header><b>${esc(def?.label || b.type)}</b><span><button type="button" class="btn sm" data-up>↑</button> <button type="button" class="btn sm" data-down>↓</button> <button type="button" class="btn sm danger" data-rm>✕</button></span></header>
      ${def.fields.map(([k, label, t]) => {
        const v = b[k];
        if (t === 'textarea') return `<label>${esc(label)}<textarea data-k="${k}" rows="3">${esc(v || '')}</textarea></label>`;
        if (t === 'list') return `<label>${esc(label)}<textarea data-k="${k}" data-t="list" rows="4">${esc((v || []).join('\n'))}</textarea></label>`;
        if (t === 'qa') return `<label>${esc(label)}<textarea data-k="${k}" data-t="qa" rows="4">${esc((v || []).map((x) => `${x.q} | ${x.a}`).join('\n'))}</textarea></label>`;
        if (t === 'datetime') return `<label>${esc(label)}<input type="datetime-local" data-k="${k}" data-t="datetime" value="${toLocalInput(v)}"></label>`;
        if (t === 'image' || t === 'video') return `<label>${esc(label)}<input data-k="${k}" value="${esc(v || '')}" placeholder="আপলোড করুন বা লিংক দিন"></label><label class="btn sm" style="width:max-content">আপলোড<input type="file" hidden accept="${t === 'video' ? 'video/mp4,video/webm' : 'image/*'}" data-up-k="${k}"></label>`;
        return `<label>${esc(label)}<input data-k="${k}" value="${esc(v || '')}"></label>`;
      }).join('')}</div>`;
  };
  const readBlocks = () => $$('.block-item', root).map((el) => {
    const b = { type: blocks[Number(el.dataset.i)].type };
    $$('[data-k]', el).forEach((inp) => {
      const t = inp.dataset.t;
      if (t === 'list') b[inp.dataset.k] = inp.value.split('\n').map((s) => s.trim()).filter(Boolean);
      else if (t === 'qa') b[inp.dataset.k] = inp.value.split('\n').map((l) => l.split('|')).filter((p) => p.length >= 2).map(([q, ...a]) => ({ q: q.trim(), a: a.join('|').trim() }));
      else if (t === 'datetime') b[inp.dataset.k] = fromLocalInput(inp.value);
      else b[inp.dataset.k] = inp.value.trim();
    });
    return b;
  });
  const draw = () => {
    root.innerHTML = `
      <div class="page-head"><h1>${isNew ? 'নতুন ল্যান্ডিং পেজ' : esc(lp.title)}</h1><div class="actions"><a class="btn" href="#/landing-pages">← সব পেজ</a>
        ${!isNew && lp.status === 'published' ? `<a class="btn" href="/lp/${esc(lp.slug)}?utm_source=${encodeURIComponent(lp.utm_source || '')}&utm_medium=${encodeURIComponent(lp.utm_medium || '')}&utm_campaign=${encodeURIComponent(lp.utm_campaign || '')}" target="_blank" rel="noopener">লাইভ দেখুন</a>` : ''}</div></div>
      <p>অবস্থা: ${statusPill({ draft: 'খসড়া', published: 'প্রকাশিত', retired: 'অবসরপ্রাপ্ত' }[lp.status], lp.status === 'published' ? 'ok' : lp.status === 'retired' ? 'bad' : 'warn')}
      ${!isNew ? `<span class="small muted"> · বিজ্ঞাপনের লিংক: ${esc(location.origin)}/lp/${esc(lp.slug)}?utm_source=${esc(lp.utm_source || 'facebook')}&utm_campaign=${esc(lp.utm_campaign || '')}&utm_content={{ad.name}}</span>` : ''}</p>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr);align-items:start">
        <form class="card grid" data-meta>${meta.map((f) => fieldHtml(f, lp[f.name])).join('')}</form>
        <div class="card grid"><h2>ব্লক</h2><div class="grid" data-blocks>${blocks.map(blockHtml).join('') || '<p class="muted">নিচ থেকে ব্লক যোগ করুন</p>'}</div>
          <div style="display:flex;gap:.4rem;flex-wrap:wrap"><select data-add-type>${Object.entries(BLOCKS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select><button class="btn" type="button" data-add>+ ব্লক যোগ করুন</button></div></div>
      </div>
      ${can('marketing.write') ? `<div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap"><button class="btn primary" data-save="">সংরক্ষণ</button>
        ${lp.status !== 'published' ? '<button class="btn" data-save="published">সংরক্ষণ ও প্রকাশ</button>' : ''}${lp.status === 'published' ? '<button class="btn danger" data-save="retired">অবসরে পাঠান</button>' : ''}${lp.status === 'retired' ? '<button class="btn" data-save="published">আবার প্রকাশ করুন</button>' : ''}</div>` : ''}`;
  };
  draw();
  root.addEventListener('click', async (e) => {
    const item = e.target.closest('.block-item');
    if (item && e.target.closest('[data-up],[data-down],[data-rm]')) {
      blocks = readBlocks();
      const i = Number(item.dataset.i);
      if (e.target.closest('[data-rm]')) blocks.splice(i, 1);
      else { const j = i + (e.target.closest('[data-up]') ? -1 : 1); if (j >= 0 && j < blocks.length) [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; }
      const metaVals = readForm($('[data-meta]', root), meta); Object.assign(lp, metaVals); draw();
    }
    if (e.target.closest('[data-add]')) { blocks = readBlocks(); blocks.push({ type: $('[data-add-type]', root).value }); Object.assign(lp, readForm($('[data-meta]', root), meta)); draw(); }
    const sv = e.target.closest('[data-save]');
    if (sv) {
      const form = $('[data-meta]', root);
      if (!form.reportValidity()) return;
      const body = { ...readForm(form, meta), blocks: readBlocks(), ...(sv.dataset.save ? { status: sv.dataset.save } : {}) };
      try {
        if (isNew) { const r = await api('/landing-pages', { method: 'POST', body }); toast('তৈরি হয়েছে'); location.hash = `#/landing-pages/${r.id}`; }
        else { const r = await api(`/landing-pages/${id}`, { method: 'PUT', body }); Object.assign(lp, r); blocks = JSON.parse(r.blocks); toast('সংরক্ষিত হয়েছে'); draw(); }
      } catch (err) { setFieldError(form, err.code, err.message); toast(err.message, true); }
    }
  });
  root.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-up-k]');
    if (!inp) return;
    const fd = new FormData(); fd.append('file', inp.files[0]);
    try { const r = await api('/uploads', { method: 'POST', body: fd }); inp.closest('.block-item').querySelector(`[data-k="${inp.dataset.upK}"]`).value = r.key; toast('আপলোড সম্পন্ন'); } catch (err) { toast(err.message, true); }
  });
}

/* ================= Chats ================= */
export async function chatsView(root) {
  const items = await api('/chats?status=escalated');
  root.innerHTML = `<div class="page-head"><h1>মানুষের সহায়তা চাওয়া চ্যাট</h1></div>
    ${items.map((c) => `<div class="card" style="margin-bottom:.8rem"><div style="display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap"><b>${esc(c.visitor_name || 'অজ্ঞাত দর্শনার্থী')} ${c.visitor_phone ? `· <a href="https://wa.me/${esc(c.visitor_phone)}" target="_blank" rel="noopener">${esc(c.visitor_phone)}</a>` : ''}</b>
      <span>${c.lead_id ? `<a class="btn sm" href="#/leads/${c.lead_id}">লিড</a> ` : ''}${can('chat.write') ? `<button class="btn sm" data-close="${c.id}">বন্ধ করুন</button>` : ''}</span></div>
      <div class="thread" style="margin-top:.5rem">${c.transcript.map((m) => `<div class="m ${m.role === 'user' ? 'client' : ''}">${esc(m.content)}<small>${m.role === 'user' ? 'দর্শনার্থী' : 'এআই'} · ${fmtDate(m.at)}</small></div>`).join('')}</div></div>`).join('') || '<div class="card empty">কোনো চ্যাট অপেক্ষায় নেই</div>'}`;
  root.addEventListener('click', async (e) => { const b = e.target.closest('[data-close]'); if (b) { await api(`/chats/${b.dataset.close}/close`, { method: 'POST', body: {} }); chatsView(root); } }, { once: true });
}

export async function chatSettingsView(root) {
  const s = await api('/chat-settings');
  const fields = [
    { name: 'ai_enabled', label: '🤖 এআই সাপোর্ট চালু', type: 'bool' },
    { name: 'greeting', label: 'এআই এর শুভেচ্ছা বার্তা', type: 'textarea', rows: 2 },
    { name: 'knowledge', label: 'এআই এর জন্য অতিরিক্ত তথ্য', type: 'textarea', rows: 6, hint: 'প্যাকেজ, দাম ও প্রশ্নোত্তর স্বয়ংক্রিয়ভাবে যুক্ত হয় — এখানে বাড়তি নীতিমালা লিখুন' },
    { name: 'escalation_message', label: 'মানুষের কাছে হস্তান্তরের বার্তা', type: 'textarea', rows: 2 },
    { name: 'whatsapp_enabled', label: '💬 হোয়াটসঅ্যাপ চালু', type: 'bool' },
    { name: 'whatsapp_number', label: 'হোয়াটসঅ্যাপ নম্বর', placeholder: '8801XXXXXXXXX' },
    { name: 'whatsapp_message', label: 'আগে থেকে লেখা বার্তা' },
    { name: 'messenger_enabled', label: 'মেসেঞ্জার চালু', type: 'bool' },
    { name: 'messenger_page', label: 'ফেসবুক পেজের ইউজারনেম', placeholder: 'yourpage' },
  ];
  root.innerHTML = `<div class="page-head"><h1>চ্যাট সেটিংস</h1></div><p class="muted">দর্শনার্থী চ্যাট বাটনে চাপ দিলে প্রথমে এই তিনটি মাধ্যম থেকে বেছে নেওয়ার সুযোগ পাবেন।</p>
    <form class="card grid" style="max-width:720px">${fields.map((f) => fieldHtml(f, s[f.name])).join('')}${can('chat.write') ? '<button class="btn primary" style="width:max-content">সংরক্ষণ</button>' : ''}</form>
    <p class="small muted">এআই প্রোভাইডার ও মডেল বদলাতে <a href="#/ai-settings">এআই সেটিংস</a> দেখুন।</p>`;
  $('form', root).addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/chat-settings', { method: 'PUT', body: readForm(e.target, fields) }); toast('সংরক্ষিত হয়েছে'); } catch (err) { toast(err.message, true); } });
}

/* ================= AI settings ================= */
export async function aiSettingsView(root) {
  const d = await api('/ai/configs');
  const pl = { gemini: 'জেমিনি (গুগল)', workers_ai: 'ক্লাউডফ্লেয়ার ওয়ার্কার্স এআই', openai: 'ওপেনএআই' };
  root.innerHTML = `<div class="page-head"><h1>এআই সেটিংস</h1></div>
    <p class="muted">এপিআই কী কখনো এখানে লেখা বা সংরক্ষণ করা হয় না — টার্মিনালে <code>wrangler secret put GEMINI_API_KEY</code> দিয়ে যোগ করুন। এখানে শুধু লুকানো আকারে অবস্থা দেখানো হয়।</p>
    ${d.configs.map((c) => `<form class="card grid" data-purpose="${c.purpose}" style="max-width:760px;margin-bottom:1rem">
      <h2>${c.purpose === 'content' ? 'কনটেন্ট সাজেশন (প্যাকেজের বিবরণ)' : 'চ্যাট সাপোর্ট'}</h2>
      <div class="grid g2"><label>প্রোভাইডার<select name="provider">${d.providers.map((p) => `<option value="${p.id}" ${p.id === c.provider ? 'selected' : ''}>${esc(pl[p.id])}</option>`).join('')}</select></label>
      <label>মডেল<input name="model" value="${esc(c.model)}"></label></div>
      <p class="small">কী: ${c.key.configured ? statusPill('সংযুক্ত ' + c.key.hint, 'ok') : statusPill('যোগ করা হয়নি', 'warn')} ${c.last_test_at ? `· শেষ পরীক্ষা ${fmtDate(c.last_test_at)} ${c.last_test_ok ? '✓' : '✗'}` : ''}</p>
      <label>সিস্টেম নির্দেশনা<textarea name="system_prompt" rows="4">${esc(c.system_prompt)}</textarea></label>
      <label>লেখার ধরন<input name="tone" value="${esc(c.tone)}"></label>
      <div style="display:flex;gap:.5rem">${can('ai.configure') ? '<button class="btn primary">সংরক্ষণ</button>' : ''}${can('ai.use') ? '<button class="btn" type="button" data-test>সংযোগ পরীক্ষা</button>' : ''}</div>
      <p class="small" data-test-out></p></form>`).join('')}`;
  $$('form', root).forEach((f) => {
    f.addEventListener('submit', async (e) => { e.preventDefault(); try { await api(`/ai/configs/${f.dataset.purpose}`, { method: 'PUT', body: Object.fromEntries(new FormData(f)) }); toast('সংরক্ষিত হয়েছে'); aiSettingsView(root); } catch (err) { toast(err.message, true); } });
    $('[data-test]', f)?.addEventListener('click', async () => {
      const out = $('[data-test-out]', f); out.textContent = 'পরীক্ষা চলছে…';
      try { const r = await api(`/ai/configs/${f.dataset.purpose}/test`, { method: 'POST', body: {} }); out.textContent = r.ok ? `✓ সংযোগ সফল: ${r.detail}` : `✗ ব্যর্থ: ${r.detail}`; } catch (err) { out.textContent = err.message; }
    });
  });
}

/* ================= Reports ================= */
export async function reportsView(root) {
  const today = new Date().toISOString().slice(0, 10);
  const from0 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  root.innerHTML = `<div class="page-head"><h1>রিপোর্ট ও অ্যানালিটিক্স</h1><div class="actions">${can('export') ? '<a class="btn" href="/api/admin/orders/export.csv">অর্ডার সিএসভি</a><a class="btn" href="/api/admin/leads/export.csv">লিড সিএসভি</a><a class="btn" href="/api/admin/reviews-export.csv">রিভিউ সিএসভি</a>' : ''}</div></div>
    <form class="toolbar" data-range><label>শুরু<input type="date" name="from" value="${from0}"></label><label>শেষ<input type="date" name="to" value="${today}"></label><button class="btn" style="align-self:end">দেখুন</button></form><div data-out>লোড হচ্ছে…</div>`;
  const load = async (from, to) => {
    const r = await api(`/reports?from=${from}&to=${to}`);
    const s = r.summary;
    const conv = (paid, total) => (total ? bn(Math.round((paid / total) * 100)) + '%' : '—');
    const table = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td class="empty" colspan="${head.length}">তথ্য নেই</td></tr>`}</tbody></table></div>`;
    $('[data-out]', root).innerHTML = `
      <div class="kpis"><div class="kpi"><b>${bn(s.orders || 0)}</b><span>মোট অর্ডার</span></div><div class="kpi"><b>${bn(s.paid_orders || 0)}</b><span>পরিশোধিত</span></div><div class="kpi"><b>${taka(s.revenue)}</b><span>আয়</span></div><div class="kpi"><b>${taka(s.aov)}</b><span>গড় অর্ডার মূল্য</span></div></div>
      <div class="card" style="margin-bottom:1rem"><h2>কোন বিজ্ঞাপন / ক্যাম্পেইন বিক্রি এনেছে</h2><p class="small muted">utm_content এ বিজ্ঞাপনের নাম পাঠালে প্রতিটি ক্রিয়েটিভ আলাদা দেখা যাবে।</p>
        ${table(['সোর্স', 'ক্যাম্পেইন', 'কনটেন্ট/বিজ্ঞাপন', 'লিড', 'অর্ডার', 'পরিশোধিত', 'রূপান্তর', 'আয়'], r.byCampaign.map((x) => `<tr><td>${esc(x.source)}</td><td>${esc(x.campaign)}</td><td>${esc(x.content)}</td><td>${bn(x.leads)}</td><td>${bn(x.orders)}</td><td>${bn(x.paid)}</td><td>${conv(x.paid, x.orders)}</td><td>${taka(x.revenue)}</td></tr>`))}</div>
      <div class="card" style="margin-bottom:1rem"><h2>ল্যান্ডিং পেজ অনুযায়ী</h2>${table(['পেজ', 'অবস্থা', 'লিড', 'অর্ডার', 'পরিশোধিত', 'আয়'], r.byLanding.map((x) => `<tr><td><a href="#/landing-pages/${x.id}">${esc(x.title)}</a><br><span class="small muted">/lp/${esc(x.slug)}</span></td><td>${esc(x.status)}</td><td>${bn(x.leads)}</td><td>${bn(x.orders)}</td><td>${bn(x.paid)}</td><td>${taka(x.revenue)}</td></tr>`))}</div>
      <div class="grid g2"><div class="card"><h2>প্যাকেজ অনুযায়ী বিক্রি</h2>${table(['প্যাকেজ', 'বিক্রি', 'আয়'], r.byPackage.map((x) => `<tr><td>${esc(x.package_name)}</td><td>${bn(x.sold)}</td><td>${taka(x.revenue)}</td></tr>`))}</div>
        <div class="card"><h2>পেমেন্ট মাধ্যম</h2>${table(['মাধ্যম', 'অর্ডার', 'পরিশোধিত'], r.byMethod.map((x) => `<tr><td>${esc(METHOD[x.payment_method] || x.payment_method)}</td><td>${bn(x.orders)}</td><td>${bn(x.paid)}</td></tr>`))}</div>
        <div class="card"><h2>লিডের উৎস</h2>${table(['উৎস', 'লিড', 'অর্ডারে রূপান্তর'], r.leadsBySource.map((x) => `<tr><td>${esc(SRC[x.source] || x.source)}</td><td>${bn(x.leads)}</td><td>${bn(x.won)}</td></tr>`))}</div>
        <div class="card"><h2>প্রজেক্ট পাইপলাইন</h2>${table(['অবস্থা', 'সংখ্যা'], r.funnel.map((x) => `<tr><td>${esc(r.statusLabels[x.project_status])}</td><td>${bn(x.n)}</td></tr>`))}</div>
        <div class="card"><h2>রেফারেল</h2>${table(['কোড', 'রেফারার', 'ব্যবহার'], r.referrals.map((x) => `<tr><td>${esc(x.code)}</td><td>${esc(x.description)}</td><td>${bn(x.used_count)}</td></tr>`))}</div></div>`;
  };
  $('[data-range]', root).addEventListener('submit', (e) => { e.preventDefault(); load(e.target.from.value, e.target.to.value).catch((err) => toast(err.message, true)); });
  await load(from0, today);
}

/* ================= System settings ================= */
export async function settingsView(root) {
  const { settings: s, env } = await api('/settings');
  const groups = [
    ['ব্র্যান্ড ও যোগাযোগ', [['brand_name', 'ব্র্যান্ডের নাম'], ['brand_tagline', 'ট্যাগলাইন', 'textarea'], ['contact_phone', 'ফোন'], ['contact_email', 'ইমেইল'], ['contact_address', 'ঠিকানা'], ['business_hours', 'কাজের সময়']]],
    ['ট্র্যাকিং', [['meta_pixel_id', 'মেটা পিক্সেল আইডি'], ['ga4_id', 'জিএ৪ মেজারমেন্ট আইডি'], ['gtm_id', 'গুগল ট্যাগ ম্যানেজার আইডি'], ['clarity_id', 'মাইক্রোসফট ক্ল্যারিটি আইডি']]],
    ['পেমেন্ট', [['pay_sslcommerz_enabled', 'এসএসএলকমার্জ (বিকাশ/নগদ/রকেট/কার্ড) চালু', 'bool'], ['pay_bank_enabled', 'ব্যাংক ট্রান্সফার চালু', 'bool'], ['bank_details', 'ব্যাংকের তথ্য', 'textarea'], ['pay_manual_mfs_enabled', 'ম্যানুয়াল সেন্ড মানি চালু (গেটওয়ে না থাকলে)', 'bool'], ['manual_bkash_number', 'বিকাশ নম্বর'], ['manual_nagad_number', 'নগদ নম্বর'], ['manual_rocket_number', 'রকেট নম্বর'], ['pay_stripe_enabled', 'আন্তর্জাতিক কার্ড (স্ট্রাইপ) চালু', 'bool'], ['usd_rate', '১ ডলার = কত টাকা', 'number']]],
    ['অটোমেশন', [['lead_followup_hours', 'কত ঘণ্টা পর স্বয়ংক্রিয় ফলো-আপ', 'number'], ['lead_followup_max', 'সর্বোচ্চ স্বয়ংক্রিয় ফলো-আপ', 'number'], ['stuck_threshold_days', 'কত দিন একই ধাপে থাকলে সতর্কতা', 'number'], ['referral_enabled', 'রেফারেল প্রোগ্রাম চালু', 'bool'], ['referral_percent', 'রেফারেল ছাড় (%)', 'number']]],
    ['পেজের লেখা', [['page_about', 'আমাদের সম্পর্কে', 'textarea'], ['page_refund', 'রিফান্ড নীতি', 'textarea'], ['page_terms', 'শর্তাবলি', 'textarea'], ['page_privacy', 'গোপনীয়তা নীতি', 'textarea']]],
  ];
  const fields = groups.flatMap(([, fs]) => fs.map(([name, label, type]) => ({ name, label, type: type || 'text', rows: 5, max: 20000 })));
  root.innerHTML = `<div class="page-head"><h1>সিস্টেম সেটিংস</h1></div>
    <p class="small muted">পরিবেশ: <b>${esc(env.appEnv)}</b> · পেমেন্ট মোড: <b>${env.paymentMode === 'live' ? 'লাইভ' : 'স্যান্ডবক্স (পারচেজ ইভেন্ট পাঠানো হয় না)'}</b> · ${esc(env.siteUrl)}</p>
    <form class="grid" style="max-width:820px">${groups.map(([title, fs]) => `<div class="card grid"><h2>${esc(title)}</h2>${fs.map(([name]) => fieldHtml(fields.find((f) => f.name === name), s[name])).join('')}</div>`).join('')}
    ${can('settings.write') ? '<button class="btn primary" style="width:max-content">সংরক্ষণ করুন</button>' : ''}</form>`;
  const form = $('form', root);
  form.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/settings', { method: 'PUT', body: readForm(form, fields) }); toast('সংরক্ষিত হয়েছে'); } catch (err) { toast(err.message, true); } });
}

/* ================= Help ================= */
export function helpView(root) {
  root.innerHTML = `<div class="card help" style="max-width:860px"><h1>সহায়তা কেন্দ্র</h1>
  <h2>নতুন প্যাকেজ যোগ করা</h2><ol><li>বাম মেনু › প্যাকেজ › “+ নতুন প্যাকেজ”।</li><li>নাম, দাম ও ফিচার লিখে সংরক্ষণ করুন।</li><li>“এআই দিয়ে সাজেস্ট” চাপলে একটি খসড়া আসবে — পড়ে, সম্পাদনা করে অনুমোদন দিন।</li><li>স্ক্রিনশট ও ছোট ডেমো ভিডিও আপলোড করুন, লাইভ ডেমো লিংক দিন।</li><li>অ্যাড-অন ও অফার ডান পাশ থেকে যোগ করুন।</li></ol>
  <h2>অফার ও টাইমার</h2><p>অফারের “শেষ” সময় পার হলেই সার্ভার নিজে থেকে ছাড় দেওয়া বন্ধ করে দেয় — টাইমার শুধু দেখানোর জন্য নয়।</p>
  <h2>বিজ্ঞাপনের জন্য ল্যান্ডিং পেজ</h2><ol><li>ল্যান্ডিং পেজ › নতুন — ব্লক যোগ করে পেজ সাজান।</li><li>“সংরক্ষণ ও প্রকাশ” করুন। বিজ্ঞাপনে যে লিংক দেবেন তা পেজের উপরে দেখানো আছে — utm_content এ বিজ্ঞাপনের নাম দিন, তাহলে রিপোর্টে প্রতিটি ক্রিয়েটিভের ফল আলাদা দেখা যাবে।</li><li>ক্যাম্পেইন শেষ হলে “অবসরে পাঠান”।</li></ol>
  <h2>অর্ডারের ধাপ</h2><p>পেমেন্টের অপেক্ষায় → নিশ্চিত → তথ্য সংগ্রহ → ডেভেলপমেন্ট → ক্লায়েন্ট রিভিউ → সংশোধন → ডেলিভারি → সম্পূর্ণ। প্রতিটি ধাপ বদলালে ক্লায়েন্ট স্বয়ংক্রিয়ভাবে বার্তা পান। পেমেন্ট নিশ্চিত না হলে প্রজেক্ট সামনে এগোনো যায় না।</p>
  <h2>ব্যাংক / সেন্ড মানি পেমেন্ট</h2><p>ক্লায়েন্ট ট্রানজেকশন আইডি দিলে অর্ডারটি “যাচাই প্রয়োজন” হিসেবে আসবে। ব্যাংক বা মোবাইল ওয়ালেটের স্টেটমেন্টে টাকা দেখে তবেই নিশ্চিত করুন। নিশ্চিত করলেই ইনভয়েস নম্বর তৈরি হয় এবং মেটা-তে “পারচেজ” ইভেন্ট যায় — তাই অনুমানের ভিত্তিতে কখনো নিশ্চিত করবেন না।</p>
  <h2>সৎ সামাজিক প্রমাণ</h2><p>হোমপেজের ক্লায়েন্ট সংখ্যা ও রেটিং আসল অর্ডার ও অনুমোদিত রিভিউ থেকে হিসাব হয়। “যাচাইকৃত” ব্যাজ শুধু আসল অর্ডারের পোর্টাল থেকে আসা রিভিউতে দেখায়।</p>
  <h2>নিরাপত্তা</h2><ul><li>প্রতিটি স্টাফের আলাদা অ্যাকাউন্ট দিন, প্রয়োজনের চেয়ে বেশি অনুমতি দেবেন না।</li><li>ক্লায়েন্টের প্রজেক্ট তথ্য দেখলে তা অ্যাক্টিভিটি লগে রেকর্ড হয়।</li><li>কোনো এপিআই কী বা পাসওয়ার্ড চ্যাটে/ইমেইলে শেয়ার করবেন না।</li></ul></div>`;
}
