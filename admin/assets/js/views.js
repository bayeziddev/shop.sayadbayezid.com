import { $, $$, api, bn, taka, esc, fmtDate, toast, confirmDialog, slideOver, openForm, fieldHtml, readForm, bindMedia, setFieldError, listView, statusPill, can, state, toLocalInput, fromLocalInput } from './core.js';

const PS = () => state.lookups?.statuses || [];
const psLabel = (k) => PS().find((s) => s.key === k)?.label || k;
const PAY = { unpaid: ['পরিশোধ হয়নি', 'bad'], pending_verification: ['যাচাই প্রয়োজন', 'warn'], paid: ['পরিশোধিত', 'ok'], failed: ['ব্যর্থ', 'bad'], refunded: ['ফেরত', 'info'] };
export const payPill = (s) => statusPill(...(PAY[s] || [s]));
export const projPill = (s) => statusPill(psLabel(s), s === 'completed' ? 'ok' : s === 'cancelled' ? 'bad' : s === 'pending_payment' ? 'warn' : 'info');
const SRC = { leadbox: 'লিড বক্স', quote: 'কোটেশন', chat: 'চ্যাট', quiz: 'কুইজ', landing: 'ল্যান্ডিং পেজ', contact: 'যোগাযোগ' };
const LEAD = { new: 'নতুন', contacted: 'যোগাযোগ হয়েছে', follow_up: 'ফলো-আপ', won: 'অর্ডার হয়েছে', lost: 'হারানো' };
export { SRC, LEAD };
const METHOD = { bkash: 'বিকাশ', nagad: 'নগদ', rocket: 'রকেট', card: 'কার্ড', bank_transfer: 'ব্যাংক', stripe: 'আন্তর্জাতিক কার্ড', sslcommerz: 'এসএসএলকমার্জ' };
export { METHOD };
const waLink = (phone) => `https://wa.me/${String(phone).replace(/\D/g, '')}`;

/* ================= Dashboard ================= */
let chart;
export async function dashboard(root) {
  const [d, sf] = await Promise.all([api('/dashboard'), api('/storefront').catch(() => null)]);
  const k = d.kpi;
  const a = d.attention;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const hello = hour < 12 ? 'সুপ্রভাত' : hour < 17 ? 'শুভ দুপুর' : 'শুভ সন্ধ্যা';
  const optional = (h) => h.hint === 'ঐচ্ছিক' || String(h.hint).startsWith('ঐচ্ছিক');
  const sfLine = !sf || !sf.pages ? 'সাইট সরাসরি এই সার্ভার থেকে চলছে — আলাদা আপডেটের দরকার নেই।'
    : sf.token && sf.repo ? `দাম, অফার বা লেখা বদলালেই পাবলিক সাইট ১–২ মিনিটে নিজে থেকে আপডেট হয়।${sf.last ? ` শেষ আপডেট শুরু: ${fmtDate(sf.last.at)} ${sf.last.ok ? '✓' : '✗'}` : ''}`
    : 'পাবলিক সাইট (GitHub Pages) কয়েক ঘণ্টা পরপর নিজে আপডেট হয়। দাম বা অফার বদলানোর পর দাম সাথে সাথেই ঠিক দেখায়; বাকি লেখার জন্য “সাইট আপডেট” চাপুন অথবা PAGES_REFRESH_TOKEN যোগ করুন (সহায়তা দেখুন)।';
  root.innerHTML = `
  <div class="page-head"><div><h1>${hello}, ${esc(state.me.name)}</h1><p class="sub">${fmtDate(new Date().toISOString())}</p></div>
    <div class="actions">${can('catalog.write') ? '<a class="btn" href="#/packages/new">+ নতুন প্যাকেজ</a><a class="btn" href="#/courses/new">+ নতুন কোর্স</a>' : ''}<a class="btn primary" href="#/orders">অর্ডার দেখুন</a></div></div>
  <div class="kpis">
    <div class="kpi"><b>${bn(k.orders_today)}</b><span>আজকের অর্ডার</span></div>
    <div class="kpi"><b>${taka(k.revenue_today)}</b><span>আজকের আয়</span></div>
    <div class="kpi"><b>${taka(k.revenue_30d)}</b><span>গত ৩০ দিনের আয়</span></div>
    <div class="kpi"><b>${bn(k.leads_today)}</b><span>আজকের নতুন লিড</span></div>
    <div class="kpi"><b>${bn(k.active_chats)}</b><span>সহায়তা চাওয়া চ্যাট</span></div>
    <div class="kpi"><b>${bn(k.awaiting_delivery)}</b><span>ডেলিভারির অপেক্ষায়</span></div>
  </div>
  ${d.onboarding && d.onboarding.some((s) => !s.done) ? `<div class="card onboard"><div class="card-head"><h2>শুরু করার ধাপ</h2>${can('settings.write') ? '<button class="btn sm" data-dismiss-onboard>লুকান</button>' : ''}</div>
    <ol>${d.onboarding.map((s) => `<li class="${s.done ? 'done' : ''}">${s.done ? esc(s.label) : `<a href="${s.link}">${esc(s.label)}</a>`}</li>`).join('')}</ol></div>` : ''}
  <h2>আজ যেগুলোতে নজর দরকার</h2>
  <div class="attention">
    <div class="card"><h3>নতুন লিড (${bn(a.newLeads.length)})</h3><ul>${a.newLeads.map((l) => `<li><a href="#/leads/${l.id}">${esc(l.name)}</a> <span class="muted small">${SRC[l.source] || l.source}</span>${can('leads.write') ? `<button class="btn sm" data-followed="${l.id}">ফলো-আপ হয়েছে</button>` : ''}</li>`).join('') || '<li class="muted">কিছু নেই 🎉</li>'}</ul></div>
    <div class="card"><h3>পেমেন্ট যাচাই বাকি (${bn(a.pendingPayments.length)})</h3><ul>${a.pendingPayments.map((o) => `<li><a href="#/orders/${o.id}">${esc(o.order_number)}</a> <span>${taka(o.total)}</span></li>`).join('') || '<li class="muted">কিছু নেই</li>'}</ul></div>
    <div class="card"><h3>সহায়তা চাওয়া চ্যাট (${bn(a.escalatedChats.length)})</h3><ul>${a.escalatedChats.map((c) => `<li><a href="#/chats">${esc(c.visitor_name || 'অজ্ঞাত দর্শনার্থী')}</a><span class="muted small">${fmtDate(c.updated_at)}</span></li>`).join('') || '<li class="muted">কিছু নেই</li>'}</ul></div>
    <div class="card"><h3>অনেক দিন একই ধাপে (${bn(a.stuckOrders.length)})</h3><ul>${a.stuckOrders.map((o) => `<li><a href="#/orders/${o.id}">${esc(o.order_number)}</a> ${projPill(o.project_status)}${can('orders.write') ? `<button class="btn sm" data-advance="${o.id}">পরের ধাপ</button>` : ''}</li>`).join('') || '<li class="muted">কিছু নেই</li>'}</ul></div>
    ${a.pendingReviews ? `<div class="card"><h3>অনুমোদনের অপেক্ষায় রিভিউ</h3><p><a href="#/reviews">${bn(a.pendingReviews)}টি রিভিউ দেখুন</a></p></div>` : ''}
  </div>
  <div class="dash-row">
    <div class="card"><h2>বিক্রি — গত ৩০ দিন</h2><div class="chart-box"><canvas id="sales-chart" aria-label="বিক্রির চার্ট"></canvas></div></div>
    <div class="grid">
      <div class="card"><div class="card-head"><h2>পাবলিক সাইট</h2>${can('catalog.write') && sf?.pages ? '<button class="btn sm" data-dash-refresh>↻ এখনই আপডেট</button>' : ''}</div><p class="small muted" style="margin:0">${esc(sfLine)}</p></div>
      <div class="card"><h2>সংযোগের অবস্থা</h2><ul class="status-list">${d.health.map((h) => `<li><span class="st ${h.ok ? 'ok' : optional(h) ? '' : 'warn'}">${h.ok ? '✓' : optional(h) ? '–' : '!'}</span><span>${esc(h.label)}${!h.ok && h.hint ? `<br><span class="small muted">${esc(h.hint)}</span>` : ''}</span></li>`).join('')}</ul></div>
    </div>
  </div>
  <div class="card"><div class="card-head"><h2>সাম্প্রতিক অর্ডার</h2><a class="btn sm" href="#/orders">সব অর্ডার →</a></div><div class="table-wrap"><table><thead><tr><th>অর্ডার</th><th>ক্লায়েন্ট</th><th>মোট</th><th>পেমেন্ট</th><th>অবস্থা</th><th>তারিখ</th></tr></thead><tbody>
    ${d.recentOrders.map((o) => `<tr><td data-label="অর্ডার"><a href="#/orders/${o.id}">${esc(o.order_number)}</a></td><td data-label="ক্লায়েন্ট">${esc(o.customer_name)}</td><td data-label="মোট">${taka(o.total)}</td><td data-label="পেমেন্ট">${payPill(o.payment_status)}</td><td data-label="অবস্থা">${projPill(o.project_status)}</td><td data-label="তারিখ" class="small">${fmtDate(o.created_at)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">এখনো কোনো অর্ডার নেই</td></tr>'}
  </tbody></table></div></div>`;
  $('[data-dash-refresh]', root)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await api('/storefront/refresh', { method: 'POST', body: {} }); toast('পাবলিক সাইট আপডেট শুরু হয়েছে — ১–২ মিনিট লাগবে'); } catch (err) { toast(err.message, true); }
    btn.disabled = false;
  });

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
      { name: 'kind', label: 'ধরন', options: [['website', 'ওয়েবসাইট'], ['course', 'কোর্স']] },
    ],
    columns: [
      { label: 'অর্ডার', render: (o) => `<a href="#/orders/${o.id}">${esc(o.order_number)}</a>${o.kind === 'course' ? ' ' + statusPill('🎓 কোর্স', 'info') : ''}${o.invoice_number ? `<br><span class="muted small">${esc(o.invoice_number)}</span>` : ''}` },
      { label: 'ক্লায়েন্ট', render: (o) => `${esc(o.customer_name)}<br><span class="muted small">${esc(o.customer_phone)}</span>` },
      { label: 'মোট', render: (o) => taka(o.total) },
      { label: 'পেমেন্ট', render: (o) => `${payPill(o.payment_status)}<br><span class="muted small">${METHOD[o.payment_method] || esc(o.payment_method)}</span>` },
      { label: 'প্রজেক্ট', render: (o) => (o.kind === 'course' ? (o.payment_status === 'paid' && o.project_status !== 'cancelled' ? statusPill('কোর্স চালু', 'ok') : o.project_status === 'cancelled' ? projPill('cancelled') : statusPill('পেমেন্টের অপেক্ষায়', 'warn')) : projPill(o.project_status)) },
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
    const isCourse = o.kind === 'course';
    const cs = d.course;
    const courseCard = isCourse ? `<div class="card"><h3>🎓 কোর্স অর্ডার</h3>
      ${cs?.student ? `<dl class="kv"><dt>শিক্ষার্থী</dt><dd><a href="#/students">${esc(cs.student.name)}</a> · ${esc(cs.student.phone)}${cs.student.is_blocked ? ' ' + statusPill('ব্লক', 'bad') : ''}</dd><dt>শেষ লগইন</dt><dd>${fmtDate(cs.student.last_login_at)}</dd>
        <dt>কোর্স এক্সেস</dt><dd>${cs.enrollments.length ? cs.enrollments.map((e) => `${esc(e.title)} — ${e.status === 'active' ? statusPill('প্রোফাইলে চালু', 'ok') : statusPill('বন্ধ', 'bad')}`).join('<br>') : statusPill(o.payment_status === 'paid' ? 'চালু হয়নি' : 'পেমেন্ট নিশ্চিত হলেই চালু হবে', 'warn')}</dd></dl>
        <p class="small muted">পেমেন্ট নিশ্চিত হলেই (গেটওয়ে অথবা নিচে আপনার যাচাই) কোর্সটি শিক্ষার্থীর প্রোফাইলে খুলে যায় ও তাকে জানানো হয়। অর্ডার বাতিল করলে এক্সেস বন্ধ হয়।</p>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap"><a class="btn sm" href="#/enrollments?student_id=${cs.student.id}">এই শিক্ষার্থীর সব কোর্স</a></div>` : '<p class="muted">শিক্ষার্থীর তথ্য নেই</p>'}</div>` : '';
    so.body.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
        <div><h2 style="margin:0">${esc(o.order_number)} ${o.invoice_number ? `<span class="muted small">· ${esc(o.invoice_number)}</span>` : ''}</h2><div>${payPill(o.payment_status)} ${projPill(o.project_status)}</div></div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap"><a class="btn sm" href="${d.invoiceUrl}" target="_blank" rel="noopener">ইনভয়েস</a><a class="btn sm" href="${d.portalUrl}" target="_blank" rel="noopener">ক্লায়েন্ট পোর্টাল</a><a class="btn sm" href="${waLink(o.customer_phone)}" target="_blank" rel="noopener">হোয়াটসঅ্যাপ</a></div>
      </div>
      ${isCourse ? courseCard : `<div class="pipeline">${pipeline.map((s, i) => `<span class="${i < curIdx ? 'done' : i === curIdx ? 'cur' : ''}">${esc(s.label)}</span>`).join('')}</div>`}
      ${can('orders.write') && d.nextStatuses.length ? `<div class="card"><h3>${isCourse ? 'অর্ডার বাতিল (ফেরত দিলে) — কোর্স এক্সেসও বন্ধ হবে' : 'পরের ধাপে নিন'}</h3><div style="display:flex;gap:.4rem;flex-wrap:wrap">${d.nextStatuses.map((s) => `<button class="btn ${s === 'cancelled' ? 'danger' : 'primary'} sm" data-status="${s}">${esc(psLabel(s))}</button>`).join('')}</div><label style="margin-top:.6rem">নোট (ক্লায়েন্টকে পাঠানো হবে, ঐচ্ছিক)<input data-status-note maxlength="500"></label></div>` : ''}
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
      ${isCourse ? '' : `<div class="card"><h3>ক্লায়েন্টের প্রজেক্ট তথ্য</h3>${d.requirementsSubmitted ? `<p class="small muted">জমা: ${fmtDate(d.requirementsSubmitted.submitted_at)}</p>${can('requirements.read') ? '<button class="btn sm" data-req>তথ্য দেখুন (অডিট লগে রেকর্ড হবে)</button><div data-req-box></div>' : '<p class="muted">দেখার অনুমতি নেই</p>'}` : '<p class="muted">এখনো জমা দেননি।</p>'}
        <h3 style="margin-top:.8rem">ক্লায়েন্টের ফাইল</h3><ul>${d.files.filter((f) => f.kind === 'requirement_asset').map((f) => `<li><a href="/api/admin/orders/${id}/files/${f.id}">${esc(f.filename)}</a></li>`).join('') || '<li class="muted">নেই</li>'}</ul></div>
      ${can('orders.write') ? `<div class="card"><h3>প্রিভিউ ও ডেলিভারি</h3>
        <form class="grid" data-delivery><label>প্রিভিউ লিংক <small>ক্লায়েন্ট রিভিউ ধাপে দেখানো হবে</small><input name="preview_url" value="${esc(o.preview_url)}" placeholder="https://"></label>
        <label>ডেলিভারি লিংক <small>প্রতি লাইনে: লেবেল | https://লিংক</small><textarea name="links" rows="3">${esc(o.delivery_links.map((l) => `${l.label} | ${l.url}`).join('\n'))}</textarea></label>
        <label>অভ্যন্তরীণ নোট <small>ক্লায়েন্ট দেখবেন না</small><textarea name="internal_notes" rows="3">${esc(o.internal_notes)}</textarea></label>
        <button class="btn primary sm" style="width:max-content">সংরক্ষণ</button></form>
        <h3 style="margin-top:.8rem">ডেলিভারি ফাইল</h3><ul>${d.files.filter((f) => f.kind === 'delivery').map((f) => `<li><a href="/api/admin/orders/${id}/files/${f.id}">${esc(f.filename)}</a> <button class="btn sm danger" data-del-file="${f.id}">মুছুন</button></li>`).join('') || '<li class="muted">নেই</li>'}</ul>
        <label class="btn sm" style="width:max-content">ফাইল আপলোড<input type="file" data-upload-delivery hidden></label></div>` : ''}`}
      ${isCourse ? '' : `<div class="card"><h3>ক্লায়েন্টের সাথে বার্তা</h3><div class="thread">${d.messages.map((m) => `<div class="m ${m.author}">${m.kind !== 'message' ? `<b>${m.kind === 'approval' ? '✓ অনুমোদন' : '↺ সংশোধনের অনুরোধ'}</b><br>` : ''}${esc(m.body)}<small>${m.author === 'client' ? 'ক্লায়েন্ট' : esc(m.admin_name || 'টিম')} · ${fmtDate(m.created_at)}</small></div>`).join('') || '<p class="muted">কোনো বার্তা নেই</p>'}</div>
        ${can('orders.write') ? '<form data-msg style="display:flex;gap:.4rem;margin-top:.5rem"><input name="body" required placeholder="ক্লায়েন্টকে বার্তা…"><button class="btn sm">পাঠান</button></form>' : ''}</div>`}
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
      { label: 'উৎস', render: (l) => esc(SRC[l.source] || l.source) + (l.is_internal ? ' ' + statusPill('টেস্ট', 'warn') : '') },
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
    extra: `<div class="card"><dl class="kv"><dt>ফোন</dt><dd><a href="tel:+${esc(l.phone)}">${esc(l.phone)}</a> · <a href="${waLink(l.phone)}" target="_blank" rel="noopener">হোয়াটসঅ্যাপ</a></dd><dt>ইমেইল</dt><dd>${esc(l.email || '—')}</dd><dt>ব্যবসা</dt><dd>${esc(l.business_name || '—')}</dd><dt>উৎস</dt><dd>${esc(SRC[l.source])}</dd>${l.package_name ? `<dt>প্যাকেজ</dt><dd>${esc(l.package_name)}</dd>` : ''}<dt>ক্যাম্পেইন</dt><dd>${esc([l.utm_source, l.utm_campaign, l.utm_content].filter(Boolean).join(' / ') || '—')}</dd><dt>স্বয়ংক্রিয় ফলো-আপ</dt><dd>${bn(l.auto_followups_sent)}টি পাঠানো হয়েছে</dd></dl><p style="white-space:pre-wrap;margin-top:.6rem">${esc(l.message)}</p>${l.source !== 'leadbox' && l.quiz_result ? `<p class="small muted">কুইজ: ${esc(l.quiz_result)}</p>` : ''}${l.is_internal ? `<p>${statusPill('অভ্যন্তরীণ/টেস্ট — বিজ্ঞাপন ও রিপোর্টে গোনা হয় না', 'warn')}</p>` : ''}<p style="margin-top:.6rem"><a class="btn primary sm" href="${waLink(l.phone)}?text=${encodeURIComponent(`আসসালামু আলাইকুম ${l.name}, ${state.me?.name ? '' : ''}আপনার ওয়েবসাইটের চাহিদা নিয়ে কথা বলতে চাই।`)}" target="_blank" rel="noopener">💬 হোয়াটসঅ্যাপে উত্তর দিন</a></p></div>`,
    onSubmit: async (data) => { await api(`/leads/${id}`, { method: 'PUT', body: data }); reload?.(); },
  });
}

/* ================= Package editor (with add-ons, offers & AI draft) ================= */
/* ================= Tabbed editor helpers (package + course editors) ================= */
/** Tabs that show one panel at a time; every field stays in the same form, so one save sends everything. */
function bindTabs(root, key) {
  const tabs = $$('.tabs [data-tab]', root);
  const show = (name) => {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-panel]', root).forEach((p) => { p.hidden = p.dataset.panel !== name; });
    const bar = $('[data-savebar]', root);
    if (bar) bar.hidden = !!$(`[data-panel="${name}"][data-nosave]`, root);
    try { sessionStorage.setItem(`adm_tab_${key}`, name); } catch {}
  };
  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
  let first = tabs[0]?.dataset.tab;
  try { const saved = sessionStorage.getItem(`adm_tab_${key}`); if (saved && tabs.some((t) => t.dataset.tab === saved)) first = saved; } catch {}
  if (first) show(first);
  return show;
}
const tabBar = (tabs) => `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${esc(l)}</button>`).join('')}</div>`;
const panelFields = (fields, names, values) => names.map((n) => { const f = fields.find((x) => x.name === n); return f ? fieldHtml(f, values[n]) : ''; }).join('');

/* ================= Package editor ================= */
export async function packageEditor(root, id) {
  const isNew = id === 'new';
  const p = isNew ? { status: 'active', tier: 'standard', images: '[]', features: '[]', base_price: 12000, delivery_days: 7 } : await api(`/packages/${id}`);
  const cats = state.lookups.categories.map((c) => [c.id, c.name]);
  const fields = [
    { name: 'category_id', label: 'ক্যাটাগরি', type: 'select', options: cats, required: true, numeric: true },
    { name: 'name', label: 'প্যাকেজের নাম', required: true, max: 150 },
    { name: 'slug', label: 'স্লাগ (ইউআরএল)', required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*', hint: 'ছোট হাতের ইংরেজি অক্ষর ও হাইফেন, যেমন fashion-premium' },
    { name: 'tier', label: 'স্তর', type: 'select', options: [['standard', 'রেডি সাইট'], ['basic', 'বেসিক'], ['premium', 'প্রিমিয়াম'], ['custom', 'কাস্টম']], required: true },
    { name: 'status', label: 'অবস্থা', type: 'select', options: [['active', 'সক্রিয় — সাইটে দেখায়'], ['coming_soon', 'শীঘ্রই আসছে'], ['inactive', 'নিষ্ক্রিয় — লুকানো']], required: true },
    { name: 'is_featured', label: 'হোমপেজের স্লাইডে দেখান', type: 'bool' },
    { name: 'sort_order', label: 'ক্রম (ছোট সংখ্যা আগে)', type: 'number' },
    { name: 'base_price', label: 'নিয়মিত দাম (৳)', type: 'number', min: 0, required: true, hint: 'ছাড় দিলে এটি কেটে দেখাবে' },
    { name: 'delivery_days', label: 'ডেলিভারি (কর্মদিবস)', type: 'number', min: 1 },
    { name: 'demo_url', label: 'লাইভ ডেমো লিংক (মূল বোতাম)', inputType: 'url', placeholder: 'https://' },
    { name: 'demo_links', label: 'আরও ডেমো বোতাম — যেমন অ্যাডমিন প্যানেল', type: 'links', hint: 'যেমন: অ্যাডমিন প্যানেল ডেমো | https://…' },
    { name: 'demo_login', label: 'ডেমো লগইন তথ্য (ডেমো বোতামের নিচে দেখাবে)', max: 300, placeholder: 'অ্যাডমিন: demo / demo12345' },
    { name: 'short_description', label: 'সংক্ষিপ্ত বিবরণ (কার্ডে দেখায়)', type: 'textarea', rows: 2, max: 300 },
    { name: 'solution', label: 'সমাধান — এই সাইট ক্লায়েন্টের কোন সমস্যা মেটাবে', type: 'textarea', rows: 4, max: 3000 },
    { name: 'problems', label: 'সমস্যা ও সমাধান', type: 'list', rows: 5, hint: 'প্রতি লাইনে: সমস্যা | সমাধান' },
    { name: 'how_it_works', label: 'কীভাবে কাজ করবে — ক্রেতা আসা থেকে ডেলিভারি পর্যন্ত', type: 'list', rows: 5, hint: 'প্রতি লাইনে: ধাপের নাম | কী হয়' },
    { name: 'benefits', label: 'ক্লায়েন্টের লাভ', type: 'list', rows: 4, hint: 'প্রতি লাইনে: শিরোনাম | বিবরণ' },
    { name: 'profit_points', label: 'লাভের হিসাব — টাকা কোথা থেকে আসে বা বাঁচে', type: 'list', rows: 4, hint: 'প্রতি লাইনে: লাভের উৎস | ব্যাখ্যা' },
    { name: 'roi_profit', label: 'ক্যালকুলেটর: প্রতি অর্ডারে উদাহরণ লাভ (৳)', type: 'number', min: 0, hint: '০ দিলে ক্যালকুলেটর দেখাবে না' },
    { name: 'roi_orders', label: 'ক্যালকুলেটর: দিনে উদাহরণ অর্ডার', type: 'number', min: 0 },
    { name: 'description', label: 'বিস্তারিত বিবরণ', type: 'textarea', rows: 7, max: 8000 },
    { name: 'why_us', label: 'কেন আমরা সেরা (এই প্যাকেজের জন্য আলাদা হলে)', type: 'list', rows: 4, hint: 'খালি রাখলে সাধারণ তালিকা দেখাবে · প্রতি লাইনে: শিরোনাম | বিবরণ' },
    { name: 'cover_image', label: 'কভার ছবি (কার্ড ও শেয়ারে দেখায়)', type: 'image' },
    { name: 'images', label: 'স্ক্রিনশট গ্যালারি', type: 'images' },
    { name: 'video_url', label: 'ভিডিও — ইউটিউব / ফেসবুক / ভিমিও / গুগল ড্রাইভ লিংক অথবা ফাইল আপলোড', type: 'video' },
    { name: 'screen_tour', label: 'ফিচার ট্যুর — স্ক্রিনশট ও তার পাশের লেখা', type: 'tour', hint: 'প্রতি লাইনে: ছবির লিংক | শিরোনাম | বিবরণ' },
    { name: 'features', label: 'মূল ফিচার (কার্ডে প্রথম ৩টি দেখায়)', type: 'list' },
    { name: 'feature_groups', label: 'A থেকে Z সব ফিচার', type: 'groups', hint: '# দিয়ে গ্রুপের নাম, তার নিচে প্রতি লাইনে একটি ফিচার' },
  ];
  const draft = p.ai_draft ? JSON.parse(p.ai_draft) : null;
  const writable = can('catalog.write');
  const canOffer = can('marketing.write');
  // The package's own offer (simple % control). Older flat-amount offers stay editable in the list below it.
  let offer = null;
  if (!isNew) {
    const list = (await api(`/offers?scope=package&scope_id=${id}&per=50`).catch(() => ({ items: [] }))).items;
    offer = list.find((o) => o.is_active) || null;
  }
  const pct = offer && offer.discount_type === 'percent' ? offer.discount_value : '';
  const tabs = [['basic', 'মূল তথ্য'], ['price', 'দাম ও অফার'], ['sales', 'বিক্রির লেখা'], ['media', 'ছবি ও ভিডিও'], ['features', 'ফিচার'], ...(isNew ? [] : [['extra', 'প্রশ্নোত্তর ও অ্যাড-অন']])];
  const stPill = { active: ['সক্রিয়', 'ok'], coming_soon: ['শীঘ্রই আসছে', 'info'], inactive: ['লুকানো', 'bad'] }[p.status] || ['', ''];
  root.innerHTML = `
    <a class="back" href="#/packages">← সব প্যাকেজ</a>
    <div class="page-head"><div><h1>${isNew ? 'নতুন প্যাকেজ' : esc(p.name)}</h1>${isNew ? '' : `<p class="sub">${stPill[0] ? `<span class="pill ${stPill[1]}">${stPill[0]}</span> · ` : ''}/package/${esc(p.slug)}</p>`}</div>
      <div class="actions">${!isNew ? `<a class="btn" href="#/preview?path=${encodeURIComponent('/package/' + p.slug)}">👁 প্রিভিউ</a><a class="btn" href="/package/${esc(p.slug)}" target="_blank" rel="noopener">সাইটে দেখুন ↗</a>` : ''}</div></div>
    ${draft ? `<div class="card draft" data-draft><h2>এআই খসড়া — পর্যালোচনা প্রয়োজন</h2><p class="small muted">এটি এখনো সাইটে প্রকাশিত হয়নি। সম্পাদনা করে অনুমোদন দিলে তবেই লাইভ হবে।</p>
      <div class="grid"><label>শিরোনাম<input data-d="name" value="${esc(draft.title)}"></label><label>সংক্ষিপ্ত বিবরণ<textarea data-d="short_description" rows="2">${esc(draft.shortDescription)}</textarea></label><label>বিস্তারিত<textarea data-d="description" rows="6">${esc(draft.description)}</textarea></label></div>
      ${writable ? '<div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap"><button class="btn primary" data-approve>অনুমোদন দিয়ে প্রকাশ করুন</button><button class="btn danger" data-discard>বাতিল</button></div>' : ''}</div>` : ''}
    ${tabBar(tabs)}
    <form data-pkg novalidate>
      <section class="tab-panel" data-panel="basic">
        <div class="card grid"><h2 class="section-title">প্যাকেজের পরিচয়</h2>${panelFields(fields, ['name', 'category_id'], p)}<div class="grid g2">${panelFields(fields, ['slug', 'tier'], p)}</div></div>
        <div class="card grid"><h2 class="section-title">সাইটে দেখানো</h2><div class="grid g2">${panelFields(fields, ['status', 'sort_order'], p)}</div>${panelFields(fields, ['is_featured'], p)}</div>
        <div class="card grid"><h2 class="section-title">লাইভ ডেমো</h2><p class="section-help">ক্রেতা কেনার আগে নিজে চালিয়ে দেখেন — সবচেয়ে বেশি বিক্রি আনে।</p>${panelFields(fields, ['demo_url', 'demo_links', 'demo_login'], p)}</div>
      </section>
      <section class="tab-panel" data-panel="price" hidden>
        <div class="card grid">
          <h2 class="section-title">দাম ও ছাড়</h2>
          <p class="section-help">নিয়মিত দাম লিখুন। ছাড় দিতে চাইলে শুধু “ছাড় %” লিখুন — সাইটে নিয়মিত দাম কেটে নতুন দাম দেখাবে, চেকআউটেও এই দামই নেওয়া হবে।</p>
          <div class="grid g3">${panelFields(fields, ['base_price'], p)}
            ${canOffer ? `<label>ছাড় % <small>খালি বা ০ = কোনো ছাড় নেই</small><input type="number" min="0" max="90" step="1" data-discount value="${esc(pct)}" placeholder="যেমন ৫০"></label>
            <label>ছাড় শেষ হবে <small>খালি = যতদিন না বন্ধ করেন</small><input type="datetime-local" data-discount-end value="${offer && offer.discount_type === 'percent' ? toLocalInput(offer.ends_at) : ''}"></label>` : ''}
          </div>
          <div class="price-preview" data-price-preview aria-live="polite"></div>
          ${offer && offer.discount_type !== 'percent' ? `<p class="small note-info card">এখন ${taka(offer.discount_value)} ছাড়ের একটি অফার চলছে — নিচের “সব অফার” তালিকা থেকে বদলান।</p>` : ''}
          ${panelFields(fields, ['delivery_days'], p)}
        </div>
        ${isNew ? '' : '<div class="card" data-offers></div>'}
      </section>
      <section class="tab-panel" data-panel="sales" hidden>
        <div class="card grid"><h2 class="section-title">কার্ড ও পরিচিতি</h2>${panelFields(fields, ['short_description', 'solution'], p)}</div>
        <div class="card grid"><h2 class="section-title">ক্লায়েন্টের সমস্যা ও লাভ</h2>${panelFields(fields, ['problems', 'how_it_works', 'benefits', 'profit_points'], p)}<div class="grid g2">${panelFields(fields, ['roi_profit', 'roi_orders'], p)}</div></div>
        <div class="card grid"><h2 class="section-title">বিস্তারিত</h2>${panelFields(fields, ['description', 'why_us'], p)}</div>
      </section>
      <section class="tab-panel" data-panel="media" hidden>
        <div class="card grid">${panelFields(fields, ['cover_image', 'images', 'video_url'], p)}</div>
        <div class="card grid">${panelFields(fields, ['screen_tour'], p)}</div>
      </section>
      <section class="tab-panel" data-panel="features" hidden>
        <div class="card grid">${panelFields(fields, ['features', 'feature_groups'], p)}</div>
      </section>
    </form>
    ${isNew ? '' : '<section class="tab-panel" data-panel="extra" data-nosave hidden><div class="card" data-pkg-faqs></div><div class="card" data-addons></div></section>'}
    ${writable ? `<div class="savebar" data-savebar><span class="hint">সব ট্যাবের পরিবর্তন একসাথে সংরক্ষণ হবে</span>${can('ai.use') ? '<button class="btn" type="button" data-suggest>✨ এআই সাজেশন</button>' : ''}<button class="btn primary" type="button" data-save>সংরক্ষণ করুন</button></div>` : ''}`;

  const form = $('[data-pkg]', root);
  bindMedia(form);
  bindTabs(root, 'pkg');
  const discountEl = $('[data-discount]', root);
  const preview = () => {
    const box = $('[data-price-preview]', root);
    const base = Number(form.elements.namedItem('base_price').value) || 0;
    const d = Math.max(0, Math.min(90, Number(discountEl?.value) || 0));
    const now = Math.round(base - (base * d) / 100);
    box.innerHTML = d > 0
      ? `ক্রেতা দেখবেন: <strong>${taka(now)}</strong> <s>${taka(base)}</s> <span class="pill ok">${bn(d)}% ছাড়</span>`
      : `ক্রেতা দেখবেন: <strong>${taka(base)}</strong> <span class="muted small">এককালীন — কোনো ছাড় নেই</span>`;
  };
  form.addEventListener('input', (e) => { if (e.target.name === 'base_price' || e.target.matches('[data-discount]')) preview(); });
  discountEl?.addEventListener('input', preview);
  preview();

  /** Create, change or switch off the package's own % offer to match the simple control. */
  async function syncOffer(pkgId) {
    if (!discountEl) return;
    const d = Math.max(0, Math.min(90, Math.round(Number(discountEl.value) || 0)));
    const endEl = $('[data-discount-end]', root);
    const ends = endEl?.value ? fromLocalInput(endEl.value) : null;
    if (d > 0) {
      const body = { scope: 'package', scope_id: Number(pkgId), title: `${bn(d)}% ছাড়`, discount_type: 'percent', discount_value: d, ends_at: ends, show_timer: ends ? 1 : 0, is_active: 1 };
      if (offer && offer.discount_type === 'percent') offer = await api(`/offers/${offer.id}`, { method: 'PUT', body });
      else offer = await api('/offers', { method: 'POST', body });
    } else if (offer && offer.discount_type === 'percent' && offer.is_active) {
      await api(`/offers/${offer.id}`, { method: 'PUT', body: { is_active: 0 } });
      offer = null;
    }
  }

  const save = async () => {
    setFieldError(form);
    const data = readForm(form, fields);
    const btn = $('[data-save]', root);
    if (btn) btn.disabled = true;
    try {
      if (isNew) {
        const r = await api('/packages', { method: 'POST', body: data });
        await syncOffer(r.id);
        toast('প্যাকেজ তৈরি হয়েছে');
        location.hash = `#/packages/${r.id}`;
      } else {
        await api(`/packages/${id}`, { method: 'PUT', body: data });
        await syncOffer(id);
        toast('সংরক্ষিত হয়েছে — পাবলিক সাইটে ১–২ মিনিটে দেখা যাবে');
        offersList?.reload();
      }
    } catch (err) {
      setFieldError(form, err.code, err.message);
      // Show the tab that holds the field with the problem.
      const bad = err.code && form.querySelector(`[name="${err.code}"]`);
      const panel = bad?.closest('[data-panel]');
      if (panel) $(`.tabs [data-tab="${panel.dataset.panel}"]`, root)?.click();
      toast(err.message, true);
    } finally { if (btn) btn.disabled = false; }
  };
  $('[data-save]', root)?.addEventListener('click', save);
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  $('[data-suggest]', root)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const label = btn.textContent;
    const el = (n) => form.elements.namedItem(n);
    const name = (el('name')?.value || '').trim();
    if (!name) { toast('আগে প্যাকেজের নাম লিখুন — এআই নাম ও ফিচার দেখে লেখে', true); $('.tabs [data-tab="basic"]', root)?.click(); el('name')?.focus(); return; }
    const features = (el('features')?.value || '').split('\n').map((x) => x.trim()).filter(Boolean);
    btn.disabled = true;
    btn.textContent = 'তৈরি হচ্ছে… (১০–৩০ সেকেন্ড)';
    try {
      const r = await api('/ai/suggest', { method: 'POST', body: { packageId: isNew ? undefined : Number(id), name, features } });
      if (isNew) {
        const set = (n, v) => { const input = el(n); if (input && v) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); } };
        set('name', r.draft.title); set('short_description', r.draft.shortDescription); set('description', r.draft.description);
        toast('এআই-এর লেখা ফর্মে বসানো হয়েছে — দেখে সংরক্ষণ করুন');
      } else {
        toast('খসড়া তৈরি হয়েছে — উপরে পর্যালোচনা করে অনুমোদন দিন');
        await packageEditor(root, id);
        $('[data-draft]', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    } catch (err) { toast(err.message, true); }
    btn.disabled = false;
    btn.textContent = label;
  });
  $('[data-approve]', root)?.addEventListener('click', async () => {
    const body = Object.fromEntries($$('[data-d]', root).map((el) => [el.dataset.d, el.value]));
    try { await api(`/packages/${id}/approve-draft`, { method: 'POST', body }); toast('অনুমোদিত ও প্রকাশিত'); packageEditor(root, id); } catch (err) { toast(err.message, true); }
  });
  $('[data-discard]', root)?.addEventListener('click', async () => { await api(`/packages/${id}/discard-draft`, { method: 'POST', body: {} }); packageEditor(root, id); });

  let offersList = null;
  if (!isNew) {
    const addonFields = [
      { name: 'name', label: 'নাম', required: true, max: 120 }, { name: 'description', label: 'বিবরণ', max: 300 },
      { name: 'price_delta', label: 'অতিরিক্ত দাম (৳)', type: 'number', min: 0, required: true }, { name: 'max_quantity', label: 'সর্বোচ্চ সংখ্যা (১ = চালু/বন্ধ)', type: 'number', min: 1, default: 1 },
      { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 }, { name: 'sort_order', label: 'ক্রম', type: 'number', default: 0 },
    ];
    await listView($('[data-pkg-faqs]', root), {
      title: 'এই প্যাকেজের প্রশ্নোত্তর', singular: 'প্রশ্ন', endpoint: '/faqs', defaultFilters: { scope: 'package', package_id: id }, search: false, writePerm: 'marketing.write', perPage: 50, titleKey: 'question', embedded: true,
      intro: 'প্যাকেজ পেজের নিচে দেখায়, তারপর সাইটের সাধারণ প্রশ্নগুলো।',
      fields: [{ name: 'question', label: 'প্রশ্ন', required: true, max: 300 }, { name: 'answer', label: 'উত্তর', type: 'textarea', required: true }, { name: 'sort_order', label: 'ক্রম', type: 'number', default: 0 }, { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 }],
      newValues: { is_active: 1, sort_order: 0 }, toApi: (d) => ({ ...d, scope: 'package', package_id: Number(id) }),
      columns: [{ label: 'প্রশ্ন', render: (f) => `<b>${esc(f.question)}</b><br><span class="small muted">${esc(String(f.answer).slice(0, 90))}</span>` }, { label: '', render: (f) => (f.is_active ? '' : statusPill('বন্ধ', 'bad')) }],
    });
    await listView($('[data-addons]', root), {
      title: 'অ্যাড-অন (ঐচ্ছিক)', singular: 'অ্যাড-অন', endpoint: '/addons', defaultFilters: { package_id: id }, search: false, writePerm: 'catalog.write', perPage: 50, embedded: true,
      intro: 'সক্রিয় অ্যাড-অন থাকলে ক্রেতা বেছে নিলে দাম বাড়ে। সব বন্ধ থাকলে প্যাকেজের দাম স্থির থাকে।',
      fields: addonFields, newValues: { is_active: 1, max_quantity: 1 }, toApi: (d) => ({ ...d, package_id: Number(id) }),
      columns: [{ label: 'নাম', key: 'name' }, { label: 'দাম', render: (a) => '+' + taka(a.price_delta) + (a.max_quantity > 1 ? ` <span class="muted small">(সর্বোচ্চ ${bn(a.max_quantity)})</span>` : '') }, { label: '', render: (a) => (a.is_active ? '' : statusPill('বন্ধ', 'bad')) }],
    });
    offersList = await listView($('[data-offers]', root), { ...offerListCfg('package', Number(id)), title: 'সব অফার (টাইমারসহ, উন্নত)', embedded: true, intro: 'উপরের “ছাড় %” এখানে একটি অফার হিসেবেই থাকে। নির্দিষ্ট সময়ের অফার, টাকায় ছাড় বা কাউন্টডাউন টাইমার চাইলে এখান থেকে দিন।' });
  }
}

/* ================= Course editor: details + chapters + lessons (video / private link / private file / notes) ================= */
const LESSON_KIND = { video: '▶ ভিডিও', link: '🔗 প্রাইভেট লিংক', file: '📄 ফাইল', text: '📝 নোট / লেখা' };
export async function courseEditor(root, id) {
  const isNew = id === 'new';
  const c = isNew ? { status: 'coming_soon', level: 'beginner', language: 'বাংলা', price: 0, regular_price: 0 } : await api(`/courses/${id}`);
  const google = await api('/google').catch(() => ({ configured: false, clientEmail: '' }));
  const cats = (state.lookups.courseCategories || []).map((x) => [x.id, `${x.icon || ''} ${x.name}`.trim()]);
  const fields = [
    { name: 'category_id', label: 'ক্যাটাগরি', type: 'select', options: cats, required: true, numeric: true },
    { name: 'title', label: 'কোর্সের নাম', required: true, max: 200 },
    { name: 'slug', label: 'স্লাগ (ইউআরএল)', required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*', hint: 'যেমন facebook-ads-mastery — পেজ হবে /course/facebook-ads-mastery' },
    { name: 'subtitle', label: 'এক লাইনে — কোর্স শেষে শিক্ষার্থী কী পারবেন', max: 300 },
    { name: 'status', label: 'অবস্থা', type: 'select', options: [['draft', 'খসড়া (সাইটে দেখাবে না)'], ['coming_soon', 'শীঘ্রই আসছে (আগ্রহীদের নাম-নম্বর নেয়)'], ['published', 'প্রকাশিত (ভর্তি চালু)'], ['archived', 'আর্কাইভ (নতুন ভর্তি বন্ধ, ভর্তিরা দেখতে পান)']], required: true },
    { name: 'price', label: 'দাম (৳) — ০ দিলে ফ্রি কোর্স', type: 'number', min: 0, required: true },
    { name: 'regular_price', label: 'আগের দাম (৳) — কেটে দেখাবে, না থাকলে ০', type: 'number', min: 0 },
    { name: 'level', label: 'লেভেল', type: 'select', options: [['beginner', 'একদম নতুনদের জন্য'], ['intermediate', 'মাঝারি'], ['advanced', 'অ্যাডভান্সড'], ['all', 'সবার জন্য']], required: true },
    { name: 'language', label: 'ভাষা', max: 40 },
    { name: 'duration_text', label: 'সময়কাল', max: 80, placeholder: 'যেমন: ১২ ঘণ্টা ভিডিও · ৬ সপ্তাহ' },
    { name: 'cover_image', label: 'কভার ছবি (কার্ড ও শেয়ারে দেখায়, ১৬:৯)', type: 'image' },
    { name: 'promo_video_url', label: 'পরিচিতি ভিডিও (সবাই দেখবে) — ইউটিউব / ফেসবুক / ভিমিও / ড্রাইভ লিংক অথবা আপলোড', type: 'video' },
    { name: 'outcomes', label: 'এই কোর্সে যা শিখবেন', type: 'list', rows: 6 },
    { name: 'description', label: 'কোর্সের বিস্তারিত (ফাঁকা লাইন দিয়ে অনুচ্ছেদ)', type: 'textarea', rows: 7, max: 12000 },
    { name: 'audience', label: 'এই কোর্স কার জন্য', type: 'list', rows: 4 },
    { name: 'includes', label: 'যা যা পাচ্ছেন', type: 'list', rows: 4, hint: 'যেমন: সারাজীবন এক্সেস · রিসোর্স ফাইল · প্রাইভেট গ্রুপ' },
    { name: 'requirements', label: 'শুরু করতে যা লাগবে', type: 'list', rows: 3 },
    { name: 'faqs', label: 'প্রশ্নোত্তর', type: 'list', rows: 5, hint: 'প্রতি লাইনে: প্রশ্ন | উত্তর' },
    { name: 'instructor_name', label: 'ইনস্ট্রাক্টরের নাম', max: 100 },
    { name: 'instructor_bio', label: 'ইনস্ট্রাক্টরের পরিচিতি', type: 'textarea', rows: 3, max: 2000 },
    { name: 'instructor_photo', label: 'ইনস্ট্রাক্টরের ছবি', type: 'image' },
    { name: 'is_featured', label: 'হোমপেজে দেখান', type: 'bool' },
    { name: 'sort_order', label: 'ক্রম (ছোট সংখ্যা আগে)', type: 'number' },
  ];
  const writable = can('catalog.write');
  const ST = { draft: ['খসড়া', 'warn'], coming_soon: ['শীঘ্রই আসছে', 'info'], published: ['প্রকাশিত — ভর্তি চালু', 'ok'], archived: ['আর্কাইভ', 'bad'] }[c.status] || ['', ''];
  const tabs = [...(isNew ? [] : [['lessons', 'অধ্যায় ও লেসন']]), ['basic', 'মূল তথ্য ও দাম'], ['sales', 'বিক্রির লেখা'], ['media', 'ছবি, ভিডিও ও ইনস্ট্রাক্টর']];
  root.innerHTML = `
    <a class="back" href="#/courses">← সব কোর্স</a>
    <div class="page-head"><div><h1>${isNew ? 'নতুন কোর্স' : esc(c.title)}</h1>${isNew ? '' : `<p class="sub"><span class="pill ${ST[1]}">${ST[0]}</span> · /course/${esc(c.slug)}</p>`}</div>
      <div class="actions">${!isNew ? `<a class="btn" href="#/preview?path=${encodeURIComponent('/course/' + c.slug)}">👁 প্রিভিউ</a><a class="btn" href="/course/${esc(c.slug)}" target="_blank" rel="noopener">সেলস পেজ ↗</a><a class="btn" href="/lp/course/${esc(c.slug)}" target="_blank" rel="noopener">বিজ্ঞাপনের পেজ ↗</a><a class="btn" href="#/enrollments?course_id=${c.id}">শিক্ষার্থী</a>` : ''}</div></div>
    ${!isNew && c.status !== 'published' ? `<p class="card draft small">ভর্তি এখন বন্ধ। লেসন যোগ করে “মূল তথ্য ও দাম” ট্যাবে দাম দিন ও অবস্থা “প্রকাশিত” করুন — তখনই ভর্তি ও পেমেন্ট চালু হবে।</p>` : ''}
    ${tabBar(tabs)}
    ${isNew ? '' : `<section class="tab-panel" data-panel="lessons" data-nosave hidden>
      <div class="editor-grid">
        <div class="card" data-lessons></div>
        <div class="editor-side">
          <div class="card" data-sections></div>
          <div class="card small"><h3>লেসনের কনটেন্ট কোথায় রাখবেন</h3><ul style="padding-left:1.1rem;margin:.3rem 0">
            <li><b>গুগল ড্রাইভ ভিডিও (সবচেয়ে নিরাপদ):</b> ${google.configured ? `ড্রাইভে ভিডিওটি <b>${esc(google.clientEmail)}</b>-এর সাথে Share করুন (Viewer), তারপর লিংকটি এখানে দিন। ফাইল “Restricted” রাখুন — শিক্ষার্থীরা সাইটের ভেতরেই দেখবেন, ড্রাইভ লিংক কেউ পাবে না।` : 'গুগল সার্ভিস অ্যাকাউন্ট যুক্ত হলে ড্রাইভের প্রাইভেট ভিডিও সাইটের ভেতরেই চলবে (এআই ও গুগল পেজ দেখুন)।'}</li>
            <li><b>ইউটিউব:</b> “Unlisted” করে লিংক দিন — সহজ, তবে লিংক কপি করে অন্যকে দেওয়া যায়।</li>
            <li><b>প্রাইভেট লিংক:</b> ড্রাইভ ফোল্ডার, ডক, লাইভ ক্লাস (জুম/মিট), গ্রুপ — শুধু ভর্তি শিক্ষার্থীরা দেখেন।</li>
            <li><b>ফাইল:</b> পিডিএফ, শিট — প্রাইভেট আপলোড অথবা ড্রাইভ ফাইলের লিংক।</li>
            <li><b>ফ্রি প্রিভিউ:</b> ১–২টি লেসনে টিক দিন — সেলস পেজে সবাই দেখবে, বিক্রি বাড়ে।</li></ul></div>
        </div>
      </div>
    </section>`}
    <form data-course novalidate>
      <section class="tab-panel" data-panel="basic" hidden>
        <div class="card grid"><h2 class="section-title">কোর্সের পরিচয়</h2>${panelFields(fields, ['title', 'subtitle', 'category_id'], c)}<div class="grid g2">${panelFields(fields, ['slug', 'level'], c)}</div></div>
        <div class="card grid"><h2 class="section-title">দাম ও অবস্থা</h2><div class="grid g2">${panelFields(fields, ['price', 'regular_price', 'status', 'duration_text', 'language', 'sort_order'], c)}</div>${panelFields(fields, ['is_featured'], c)}</div>
      </section>
      <section class="tab-panel" data-panel="sales" hidden>
        <div class="card grid">${panelFields(fields, ['outcomes', 'description', 'audience', 'includes', 'requirements', 'faqs'], c)}</div>
      </section>
      <section class="tab-panel" data-panel="media" hidden>
        <div class="card grid">${panelFields(fields, ['cover_image', 'promo_video_url'], c)}</div>
        <div class="card grid"><h2 class="section-title">ইনস্ট্রাক্টর</h2>${panelFields(fields, ['instructor_name', 'instructor_bio', 'instructor_photo'], c)}</div>
      </section>
    </form>
    ${writable ? '<div class="savebar" data-savebar><span class="hint">সব ট্যাবের পরিবর্তন একসাথে সংরক্ষণ হবে</span><button class="btn primary" type="button" data-save>সংরক্ষণ করুন</button></div>' : ''}`;
  const form = $('[data-course]', root);
  bindMedia(form);
  bindTabs(root, isNew ? 'course-new' : 'course');
  const save = async () => {
    setFieldError(form);
    const data = readForm(form, fields);
    const btn = $('[data-save]', root);
    if (btn) btn.disabled = true;
    try {
      if (isNew) { const r = await api('/courses', { method: 'POST', body: data }); state.lookups = await api('/lookups'); toast('কোর্স তৈরি হয়েছে — এবার অধ্যায় ও লেসন যোগ করুন'); location.hash = `#/courses/${r.id}`; }
      else { await api(`/courses/${id}`, { method: 'PUT', body: data }); state.lookups = await api('/lookups'); toast('সংরক্ষিত হয়েছে'); courseEditor(root, id); }
    } catch (err) {
      setFieldError(form, err.code, err.message);
      const panel = err.code && form.querySelector(`[name="${err.code}"]`)?.closest('[data-panel]');
      if (panel) $(`.tabs [data-tab="${panel.dataset.panel}"]`, root)?.click();
      toast(err.message, true);
    } finally { if (btn) btn.disabled = false; }
  };
  $('[data-save]', root)?.addEventListener('click', save);
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  if (isNew) return;

  let sections = [];
  const loadSections = async () => { sections = (await api(`/course-sections?course_id=${id}&per=200`)).items; };
  await loadSections();
  const secName = (sid) => sections.find((x) => x.id === sid)?.title || '—';
  await listView($('[data-sections]', root), {
    title: 'অধ্যায়', singular: 'অধ্যায়', endpoint: '/course-sections', defaultFilters: { course_id: id }, search: false, writePerm: 'catalog.write', perPage: 100, titleKey: 'title', embedded: true,
    intro: 'যেমন: ১. শুরু করার আগে · ২. পেজ সেটআপ · ৩. বিজ্ঞাপন',
    fields: [{ name: 'title', label: 'অধ্যায়ের নাম', required: true, max: 200 }, { name: 'sort_order', label: 'ক্রম', type: 'number', default: 0 }],
    newValues: { sort_order: (sections.at(-1)?.sort_order || 0) + 1 },
    toApi: (d) => { setTimeout(() => loadSections(), 400); return { ...d, course_id: Number(id) }; },
    columns: [{ label: '#', render: (x) => bn(x.sort_order) }, { label: 'অধ্যায়', render: (x) => `<b>${esc(x.title)}</b>` }],
  });
  const videoLabel = google.configured
    ? `ভিডিও — গুগল ড্রাইভ লিংক (${google.clientEmail}-এর সাথে শেয়ার করা, সবচেয়ে নিরাপদ) / ইউটিউব আনলিস্টেড / প্রাইভেট আপলোড`
    : 'ভিডিও — ইউটিউব (আনলিস্টেড) / ভিমিও / ড্রাইভ লিংক অথবা প্রাইভেট আপলোড';
  const lessonFields = () => [
    { name: 'title', label: 'লেসনের নাম', required: true, max: 200 },
    { name: 'section_id', label: 'অধ্যায়', type: 'select', options: () => sections.map((x) => [x.id, `${bn(x.sort_order)}. ${x.title}`]), numeric: true },
    { name: 'kind', label: 'ধরন', type: 'select', options: Object.entries(LESSON_KIND), required: true },
    { name: 'video_url', label: videoLabel, type: 'video', private: true },
    { name: 'link_url', label: 'প্রাইভেট লিংক (শুধু ভর্তি শিক্ষার্থী দেখবেন) — ড্রাইভ ফোল্ডার, ডক, লাইভ ক্লাস, গ্রুপ', inputType: 'url', placeholder: 'https://', max: 1000 },
    { name: 'file_key', label: google.configured ? 'ফাইল — প্রাইভেট আপলোড অথবা গুগল ড্রাইভ ফাইলের লিংক' : 'ফাইল (পিডিএফ / শিট / টেমপ্লেট)', type: 'privatefile', allowLink: google.configured },
    { name: 'body', label: 'লেসনের নোট / লেখা (ভিডিওর নিচে দেখাবে)', type: 'textarea', rows: 5, max: 20000 },
    { name: 'duration_text', label: 'সময়', max: 40, placeholder: 'যেমন ১২ মিনিট' },
    { name: 'sort_order', label: 'ক্রম (অধ্যায়ের ভেতরে)', type: 'number', default: 0 },
    { name: 'is_preview', label: 'ফ্রি প্রিভিউ — ভর্তির আগেই সেলস পেজে সবাই দেখবে', type: 'bool' },
    { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 },
  ];
  const isDrive = (v) => /drive\.google\.com|docs\.google\.com/.test(String(v || ''));
  const content = (l) => [
    l.video_url ? (String(l.video_url).startsWith('private/') ? '🔒 ভিডিও' : isDrive(l.video_url) && google.configured ? '🔒 ড্রাইভ ভিডিও' : '▶ ভিডিও') : '',
    l.link_url ? '🔗 লিংক' : '', l.file_key ? '📄 ফাইল' : '', l.body ? '📝 নোট' : '',
  ].filter(Boolean).join(' · ');
  await listView($('[data-lessons]', root), {
    title: 'লেসন', singular: 'লেসন', endpoint: '/course-lessons', defaultFilters: { course_id: id }, writePerm: 'catalog.write', perPage: 200, titleKey: 'title', wideForm: true, embedded: true,
    intro: 'প্রতিটি লেসনে ভিডিও, প্রাইভেট লিংক, ফাইল ও নোট — যেকোনোটি বা কয়েকটি একসাথে। শিক্ষার্থী প্রোফাইলে লেসন ধরে ধরে দেখেন।',
    filters: [{ name: 'section_id', label: 'অধ্যায়', options: () => sections.map((x) => [x.id, x.title]) }],
    fields: lessonFields,
    newValues: { kind: 'video', is_active: 1, sort_order: 0 },
    toApi: (d) => ({ ...d, course_id: Number(id) }),
    columns: [
      { label: 'অধ্যায়', render: (l) => `<span class="small">${esc(secName(l.section_id))}</span>` },
      { label: '#', render: (l) => bn(l.sort_order) },
      { label: 'লেসন', render: (l) => `<b>${esc(l.title)}</b>${l.duration_text ? ` <span class="small muted">· ${esc(l.duration_text)}</span>` : ''}<br><span class="small muted">${esc(LESSON_KIND[l.kind] || l.kind)}</span>` },
      { label: 'কনটেন্ট', render: (l) => (content(l) ? `<span class="small">${content(l)}</span>` : statusPill('কনটেন্ট নেই', 'warn')) },
      { label: '', render: (l) => (l.is_preview ? statusPill('ফ্রি প্রিভিউ', 'info') + ' ' : '') + (l.is_active ? '' : statusPill('বন্ধ', 'bad')) },
    ],
  });
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
  const g = await api('/google').catch(() => ({ configured: false, secretSet: false, clientEmail: '', projectId: '' }));
  root.innerHTML = `<div class="page-head"><div><h1>এআই ও গুগল</h1><p class="sub">গুগল সার্ভিস অ্যাকাউন্ট (প্রাইভেট ড্রাইভ ভিডিও) ও এআই লেখা/চ্যাট</p></div></div>
    <div class="card grid" style="max-width:760px;margin-bottom:1rem" data-google>
      <div class="card-head"><h2>গুগল সার্ভিস অ্যাকাউন্ট</h2>${g.configured ? statusPill('সংযুক্ত', 'ok') : statusPill(g.secretSet ? 'JSON সঠিক নয়' : 'যুক্ত হয়নি', 'warn')}</div>
      ${g.configured
        ? `<p class="small">ইমেইল: <code>${esc(g.clientEmail)}</code>${g.projectId ? ` · প্রজেক্ট: <code>${esc(g.projectId)}</code>` : ''}</p>
           <p class="small muted">কোর্সের ভিডিও বা ফাইল গুগল ড্রাইভে রেখে এই ইমেইলের সাথে Share (Viewer) করুন, তারপর লেসনে ড্রাইভ লিংকটি দিন। ফাইল “Restricted” থাকবে — শুধু ভর্তি শিক্ষার্থীরা সাইটের ভেতরে দেখবেন, ড্রাইভ লিংক কেউ পাবে না।</p>`
        : `<p class="small muted">GitHub রিপোজিটরির Settings → Secrets → Actions-এ <code>GOOGLE_SERVICES_JSON</code> নামে সার্ভিস অ্যাকাউন্টের পুরো JSON রাখুন, তারপর ডিপ্লয় আবার চালান।</p>`}
      <label>পরীক্ষার জন্য একটি ড্রাইভ ফাইলের লিংক (ঐচ্ছিক)<input data-g-url placeholder="https://drive.google.com/file/d/…/view"></label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">${can('settings.write') ? '<button class="btn primary" type="button" data-g-check>পরীক্ষা করুন</button>' : ''}</div>
      <ul class="check-steps" data-g-out></ul>
    </div>
    <p class="muted">এপিআই কী কখনো এখানে লেখা বা সংরক্ষণ করা হয় না — GitHub রিপোজিটরির Settings → Secrets → Actions-এ <code>GEMINI_API_KEY</code> রাখুন, পরের ডিপ্লয়ে নিজে থেকেই যুক্ত হয়। এখানে শুধু লুকানো আকারে অবস্থা দেখানো হয়। চ্যাটে জেমিনি কাজ না করলে সাইট নিজে থেকে ক্লাউডফ্লেয়ার এআই দিয়ে উত্তর দেয়।</p>
    <datalist id="ai-models"><option value="gemini-2.5-flash"><option value="gemini-flash-latest"><option value="gemini-2.5-flash-lite"><option value="@cf/meta/llama-3.3-70b-instruct-fp8-fast"><option value="gpt-4o-mini"></datalist>
    ${d.configs.map((c) => `<form class="card grid" data-purpose="${c.purpose}" style="max-width:760px;margin-bottom:1rem">
      <h2>${c.purpose === 'content' ? 'কনটেন্ট সাজেশন (প্যাকেজের বিবরণ)' : 'চ্যাট সাপোর্ট'}</h2>
      <div class="grid g2"><label>প্রোভাইডার<select name="provider">${d.providers.map((p) => `<option value="${p.id}" ${p.id === c.provider ? 'selected' : ''}>${esc(pl[p.id])}</option>`).join('')}</select></label>
      <label>মডেল<input name="model" value="${esc(c.model)}" list="ai-models"><small class="muted">জেমিনি: gemini-2.5-flash বা gemini-flash-latest</small></label></div>
      <p class="small">কী: ${c.key.configured ? statusPill('সংযুক্ত ' + c.key.hint, 'ok') : statusPill('যোগ করা হয়নি', 'warn')} ${c.last_test_at ? `· শেষ পরীক্ষা ${fmtDate(c.last_test_at)} ${c.last_test_ok ? '✓' : '✗'}` : ''}</p>
      <label>সিস্টেম নির্দেশনা<textarea name="system_prompt" rows="4">${esc(c.system_prompt)}</textarea></label>
      <label>লেখার ধরন<input name="tone" value="${esc(c.tone)}"></label>
      <div style="display:flex;gap:.5rem">${can('ai.configure') ? '<button class="btn primary">সংরক্ষণ</button>' : ''}${can('ai.use') ? '<button class="btn" type="button" data-test>সংযোগ পরীক্ষা</button>' : ''}</div>
      <p class="small" data-test-out></p></form>`).join('')}`;
  $('[data-g-check]', root)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const out = $('[data-g-out]', root);
    btn.disabled = true;
    out.innerHTML = '<li>পরীক্ষা চলছে…</li>';
    try {
      const r = await api('/google/check', { method: 'POST', body: { url: $('[data-g-url]', root).value.trim() } });
      out.innerHTML = r.steps.map((x) => `<li class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✓' : '✗'} ${esc(x.text)}</li>`).join('');
    } catch (err) { out.innerHTML = `<li class="bad">${esc(err.message)}</li>`; }
    btn.disabled = false;
  });
  $$('form[data-purpose]', root).forEach((f) => {
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
    ['ট্র্যাকিং', [['meta_pixel_id', 'মেটা পিক্সেল আইডি'], ['ga4_id', 'জিএ৪ মেজারমেন্ট আইডি'], ['gtm_id', 'গুগল ট্যাগ ম্যানেজার আইডি'], ['ga4_via_gtm', 'জিএ৪ জিটিএম-এর ভেতর থেকে চলে (তাহলে সাইট আলাদা করে জিএ৪ লোড করবে না — দুবার গোনা বন্ধ)', 'bool'], ['clarity_id', 'মাইক্রোসফট ক্ল্যারিটি আইডি'], ['meta_test_event_code', 'মেটা টেস্ট ইভেন্ট কোড (শুধু পরীক্ষার সময় — শেষে মুছে দিন)']]],
    ['যোগাযোগের তথ্য (ফুটার ও যোগাযোগ পেজে দেখায়)', [['whatsapp_number', 'হোয়াটসঅ্যাপ নম্বর (লিড বক্সের পর এই নম্বরে মেসেজ খুলবে)'], ['whatsapp_link', 'হোয়াটসঅ্যাপ শর্ট লিংক (wa.me/message/…)'], ['support_email', 'সাপোর্ট ইমেইল'], ['facebook_page', 'ফেসবুক পেজ ইউজারনেম'], ['map_url', 'গুগল ম্যাপ লিংক']]],
    ['লিড বক্স (প্রথম ভিজিটে ধাপে ধাপে প্রশ্ন)', [['lead_box_enabled', 'লিড বক্স চালু', 'bool'], ['lead_box_delay', 'কত সেকেন্ড পর নিজে থেকে খুলবে', 'number'], ['lead_box_title', 'প্রথম প্রশ্ন'], ['lead_box_auto_whatsapp', 'ফোনে সাবমিটের পর সরাসরি হোয়াটসঅ্যাপ খুলবে', 'bool'], ['booking_url', 'কল বুকিং লিংক (ঐচ্ছিক — Calendly / Google Calendar)']]],
    ['নতুন লিডের সাথে সাথে নোটিফিকেশন', [['lead_alert_emails', 'যে ইমেইলে লিড যাবে (কমা দিয়ে একাধিক)']]],
    ['প্রতিটি সাইটে যা থাকছে (সব প্যাকেজ পেজে দেখায়)', [['common_features', 'প্রতি লাইনে একটি পয়েন্ট', 'textarea']]],
    ['হোমপেজ — ক্লায়েন্টের সমস্যা ও সমাধান', [['home_problems', 'প্রতি লাইনে: সমস্যা | সমাধান (হোমপেজে “এই ঝামেলাগুলো কি হচ্ছে?” অংশে দেখায়)', 'textarea']]],
    ['কেন আমরা সেরা', [['why_us', 'প্রতি লাইনে একটি পয়েন্ট — শিরোনাম | বিবরণ (হোমপেজ ও প্রতিটি প্যাকেজ পেজে দেখায়)', 'textarea']]],
    ['পেমেন্ট', [['pay_sslcommerz_enabled', 'এসএসএলকমার্জ (বিকাশ/নগদ/রকেট/কার্ড) চালু', 'bool'], ['pay_bank_enabled', 'ব্যাংক ট্রান্সফার চালু', 'bool'], ['bank_details', 'ব্যাংকের তথ্য', 'textarea'], ['pay_manual_mfs_enabled', 'ম্যানুয়াল সেন্ড মানি চালু (গেটওয়ে না থাকলে)', 'bool'], ['manual_bkash_number', 'বিকাশ নম্বর'], ['manual_nagad_number', 'নগদ নম্বর'], ['manual_rocket_number', 'রকেট নম্বর'], ['pay_stripe_enabled', 'আন্তর্জাতিক কার্ড (স্ট্রাইপ) চালু', 'bool'], ['usd_rate', '১ ডলার = কত টাকা', 'number']]],
    ['অটোমেশন', [['lead_followup_hours', 'কত ঘণ্টা পর স্বয়ংক্রিয় ফলো-আপ', 'number'], ['lead_followup_max', 'সর্বোচ্চ স্বয়ংক্রিয় ফলো-আপ', 'number'], ['stuck_threshold_days', 'কত দিন একই ধাপে থাকলে সতর্কতা', 'number'], ['referral_enabled', 'রেফারেল প্রোগ্রাম চালু', 'bool'], ['referral_percent', 'রেফারেল ছাড় (%)', 'number']]],
    ['পেজের লেখা', [['page_about', 'আমাদের সম্পর্কে', 'textarea'], ['page_refund', 'রিফান্ড নীতি', 'textarea'], ['page_terms', 'শর্তাবলি', 'textarea'], ['page_privacy', 'গোপনীয়তা নীতি', 'textarea']]],
  ];
  const fields = groups.flatMap(([, fs]) => fs.map(([name, label, type]) => ({ name, label, type: type || 'text', rows: 5, max: 20000 })));
  root.innerHTML = `<div class="page-head"><h1>সিস্টেম সেটিংস</h1></div>
    <p class="small muted">পরিবেশ: <b>${esc(env.appEnv)}</b> · পেমেন্ট মোড: <b>${env.paymentMode === 'live' ? 'লাইভ' : 'স্যান্ডবক্স (পারচেজ ইভেন্ট পাঠানো হয় না)'}</b> · ${esc(env.siteUrl)}</p>
    <form class="grid" style="max-width:820px">${groups.map(([title, fs]) => `<div class="card grid"><h2>${esc(title)}</h2>${fs.map(([name]) => fieldHtml(fields.find((f) => f.name === name), s[name])).join('')}${title.startsWith('নতুন লিডের') ? `<p class="small muted">ইমেইল যায় Resend দিয়ে (RESEND_API_KEY ও EMAIL_FROM সিক্রেট লাগবে)। টেলিগ্রামে পেতে GitHub সিক্রেট TELEGRAM_BOT_TOKEN ও TELEGRAM_CHAT_ID দিন; ডিসকর্ড/স্ল্যাক/মেক/জ্যাপিয়ার বা হোয়াটসঅ্যাপ গেটওয়েতে পেতে LEAD_WEBHOOK_URL দিন — তারপর ডিপ্লয় আবার চালান। কোনটা কাজ করছে তা “ট্র্যাকিং ও বিজ্ঞাপন” পেজের নিচে দেখা যায়।</p>` : ''}</div>`).join('')}
    ${can('settings.write') ? '<button class="btn primary" style="width:max-content">সংরক্ষণ করুন</button>' : ''}</form>`;
  const form = $('form', root);
  form.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/settings', { method: 'PUT', body: readForm(form, fields) }); toast('সংরক্ষিত হয়েছে'); } catch (err) { toast(err.message, true); } });
}

/* ================= Tracking diagnostics & ad link builder ================= */
const EVENT_BN = { PageView: 'পেজ ভিউ', ViewContent: 'প্যাকেজ দেখা', Lead: 'লিড', InitiateCheckout: 'চেকআউট শুরু', Purchase: 'পারচেজ' };
const ST_BN = { sent: ['পাঠানো হয়েছে', 'ok'], failed: ['ব্যর্থ', 'bad'], skipped: ['বাদ দেওয়া', 'warn'] };
const SKIP_BN = { internal_traffic: 'আপনার নিজের/টেস্ট ভিজিট', bot: 'বট/ক্রলার', no_pixel: 'পিক্সেল আইডি নেই', network: 'নেটওয়ার্ক সমস্যা' };

export async function trackingView(root) {
  const d = await api('/tracking');
  const c = d.config;
  const pkgs = state.lookups.packages || [];
  const yes = (v, t = 'চালু') => (v ? statusPill(t, 'ok') : statusPill('নেই', 'bad'));
  root.innerHTML = `
  <div class="page-head"><h1>ট্র্যাকিং ও বিজ্ঞাপন</h1><div class="actions"><a class="btn" href="#/settings">ট্র্যাকিং সেটিংস</a></div></div>
  ${d.warnings.map((w) => `<div class="card note-${w.level}" style="margin-bottom:.6rem">${esc(w.text)}</div>`).join('')}
  <div class="grid g2">
    <div class="card"><h2>কী চালু আছে</h2><dl class="kv">
      <dt>মেটা পিক্সেল (ব্রাউজার)</dt><dd>${c.pixelId ? `${statusPill('চালু', 'ok')} <span class="small">${esc(c.pixelId)}</span>` : statusPill('নেই', 'bad')}</dd>
      <dt>কনভার্সন এপিআই (সার্ভার)</dt><dd>${yes(c.capiToken && c.appEnv === 'production')}</dd>
      <dt>জিএ৪</dt><dd>${c.ga4 ? `${statusPill(c.ga4ViaGtm ? 'জিটিএম-এর ভেতর থেকে' : 'সরাসরি', 'ok')} <span class="small">${esc(c.ga4)}</span>` : statusPill('নেই', 'warn')}</dd>
      <dt>গুগল ট্যাগ ম্যানেজার</dt><dd>${c.gtm ? `${statusPill('চালু', 'ok')} <span class="small">${esc(c.gtm)}</span>` : statusPill('নেই', 'warn')}</dd>
      <dt>ক্ল্যারিটি</dt><dd>${c.clarity ? statusPill('চালু', 'ok') : statusPill('ঐচ্ছিক')}</dd>
      <dt>পেমেন্ট মোড</dt><dd>${c.paymentMode === 'live' ? statusPill('লাইভ — আসল পেমেন্টে পারচেজ যায়', 'ok') : statusPill('স্যান্ডবক্স — পারচেজ বন্ধ', 'warn')}</dd>
      <dt>সাইট</dt><dd class="small">${esc(c.publicOrigin)}${c.publicOrigin !== c.workerOrigin ? `<br>পেমেন্ট/অর্ডার পেজ: ${esc(c.workerOrigin)} (জিএ৪ ক্রস-ডোমেইন চালু)` : ''}</dd>
    </dl>
    <h3 style="margin-top:1rem">কোন ইভেন্ট কখন যায়</h3>
    <ul class="small">
      <li><b>PageView</b> — প্রতিটি পেজে (ব্রাউজার + সার্ভার, একই event_id)</li>
      <li><b>ViewContent</b> — প্যাকেজ পেজ খুললে</li>
      <li><b>AddToCart</b> — “অর্ডার করুন” চাপলে (শুধু ব্রাউজার)</li>
      <li><b>InitiateCheckout</b> — সার্ভারে অর্ডার তৈরি হলে</li>
      <li><b>Lead</b> — কোটেশন/যোগাযোগ ফর্ম জমা হলে</li>
      <li><b>Purchase</b> — শুধু গেটওয়ে-নিশ্চিত আসল পেমেন্টে (লাইভ মোড)</li>
      <li><b>DemoClick · VideoPlay · PortfolioClick · Contact</b> — কাস্টম/এনগেজমেন্ট ইভেন্ট, অডিয়েন্স বানানোর জন্য; কখনো “পারচেজ” হিসেবে অপ্টিমাইজ করবেন না</li>
    </ul>
    <p class="small muted">নিজের ভিজিট বাদ দিতে নিজের ফোন/কম্পিউটারে একবার খুলুন: <code>${esc(c.publicOrigin)}/?sb_internal=1</code> — এরপর সেই ব্রাউজারে কোনো পিক্সেল/অ্যানালিটিক্স চলবে না, অর্ডার/লিড “অভ্যন্তরীণ” হিসেবে চিহ্নিত হবে (রিপোর্টে গোনা হবে না)। গত ৩০ দিনে: ${bn(d.internal.orders)}টি অর্ডার, ${bn(d.internal.leads)}টি লিড।</p>
    ${can('settings.write') ? `<button class="btn sm" data-test-event ${c.testEventCode ? '' : 'disabled'}>টেস্ট ইভেন্ট পাঠান</button> <span class="small muted">${c.testEventCode ? `কোড ${esc(c.testEventCode)} — ইভেন্টস ম্যানেজার › Test events-এ দেখুন` : 'আগে সেটিংসে টেস্ট ইভেন্ট কোড দিন'}</span>` : ''}
    </div>
    <div class="card"><h2>সার্ভার ইভেন্ট — গত ৭ দিন</h2>
      <div class="table-wrap"><table><thead><tr><th>ইভেন্ট</th><th>অবস্থা</th><th>সংখ্যা</th><th>শেষ</th></tr></thead><tbody>
      ${d.stats.map((r) => `<tr><td>${esc(EVENT_BN[r.event] || r.event)}</td><td>${statusPill(...(ST_BN[r.status] || [r.status]))}</td><td>${bn(r.n)}</td><td class="small">${fmtDate(r.last_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">এখনো কোনো ইভেন্ট নেই</td></tr>'}
      </tbody></table></div>
      <p class="small muted">সফল পেজ ভিউ/প্যাকেজ দেখা ইভেন্ট ২০টিতে ১টি করে লগ হয় (ডেটাবেস বাঁচাতে); ব্যর্থ ও বাকি সব ইভেন্ট পুরোটা লগ হয়।</p>
    </div>
  </div>
  <div class="card" style="margin-top:1rem"><h2>বিজ্ঞাপনের লিংক বানান</h2>
    <p class="small muted">এই লিংক বিজ্ঞাপনে দিলে প্রতিটি অর্ডার/লিড কোন ক্যাম্পেইন ও কোন বিজ্ঞাপন থেকে এল তা রিপোর্টে আলাদা দেখা যাবে।</p>
    <form class="grid g2" data-linkb>
      <label>কোন পেজে নেবে<select name="page"><option value="/">হোমপেজ</option><option value="/packages">সব প্যাকেজ</option><option value="/designs">ডিজাইন গ্যালারি</option><option value="/portfolio">সফল ডেলিভারি</option>${pkgs.map((p) => `<option value="/package/${esc(p.slug)}">প্যাকেজ: ${esc(p.name)}</option>`).join('')}</select></label>
      <label>প্ল্যাটফর্ম<select name="src"><option value="facebook|paid_social">ফেসবুক/ইনস্টাগ্রাম বিজ্ঞাপন</option><option value="google|cpc">গুগল বিজ্ঞাপন</option><option value="facebook|organic">ফেসবুক পোস্ট (ফ্রি)</option><option value="whatsapp|message">হোয়াটসঅ্যাপ</option></select></label>
      <label>ক্যাম্পেইনের নাম<input name="campaign" placeholder="যেমন: nov-ecommerce-10k"></label>
      <label>বিজ্ঞাপন/ক্রিয়েটিভের নাম<input name="content" placeholder="যেমন: video-gadget-1"></label>
      <label class="chk" style="grid-column:1/-1"><input type="checkbox" name="dynamic" checked> মেটার ডায়নামিক নাম ব্যবহার করুন ({{campaign.name}}, {{ad.name}}, {{adset.name}}) — একই লিংক সব বিজ্ঞাপনে চলবে</label>
    </form>
    <div style="display:flex;gap:.5rem;align-items:center;margin-top:.6rem"><input data-link-out readonly style="flex:1"><button class="btn primary sm" data-copy-link>কপি</button></div>
  </div>
  <div class="card" style="margin-top:1rem"><h2>সাম্প্রতিক সার্ভার ইভেন্ট</h2><div class="table-wrap"><table><thead><tr><th>সময়</th><th>ইভেন্ট</th><th>অবস্থা</th><th>বিস্তারিত</th></tr></thead><tbody>
    ${d.recent.map((r) => `<tr><td class="small">${fmtDate(r.created_at)}</td><td>${esc(EVENT_BN[r.event] || r.event)}</td><td>${statusPill(...(ST_BN[r.status] || [r.status]))}${r.http_status ? ` <span class="small muted">${bn(r.http_status)}</span>` : ''}</td><td class="small"><code>${esc(SKIP_BN[r.detail] || r.detail || '—')}</code></td></tr>`).join('') || '<tr><td colspan="4" class="empty">এখনো কিছু নেই</td></tr>'}
  </tbody></table></div></div>`;

  // Lead alerts & client messages actually sent (email / Telegram / webhook / SMS / WhatsApp).
  const CH = { email: 'ইমেইল', telegram: 'টেলিগ্রাম', webhook: 'ওয়েবহুক', sms: 'এসএমএস', whatsapp: 'হোয়াটসঅ্যাপ' };
  const NS = { sent: ['পাঠানো হয়েছে', 'ok'], failed: ['ব্যর্থ', 'bad'], skipped: ['সেটআপ নেই', 'warn'] };
  const logs = await api('/notification-log').catch(() => []);
  root.insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:1rem"><h2>নোটিফিকেশন লগ (নতুন লিড অ্যালার্ট ও ক্লায়েন্ট মেসেজ)</h2>
    <div class="table-wrap"><table><thead><tr><th>সময়</th><th>মাধ্যম</th><th>প্রাপক</th><th>বিষয়</th><th>অবস্থা</th></tr></thead><tbody>
    ${logs.slice(0, 40).map((n) => `<tr><td class="small">${fmtDate(n.created_at)}</td><td>${esc(CH[n.channel] || n.channel)}</td><td class="small">${esc(n.recipient)}</td><td class="small">${esc(n.subject)}</td><td>${statusPill(...(NS[n.status] || [n.status]))}${n.error && n.status !== 'skipped' ? ` <span class="small muted">${esc(n.error)}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">এখনো কিছু পাঠানো হয়নি</td></tr>'}
    </tbody></table></div></div>`);

  const f = $('[data-linkb]', root);
  const out = $('[data-link-out]', root);
  const build = () => {
    const [source, medium] = f.src.value.split('|');
    const u = new URL(c.publicOrigin + f.page.value);
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', medium);
    const dyn = f.dynamic.checked && source === 'facebook' && medium === 'paid_social';
    u.searchParams.set('utm_campaign', dyn ? '{{campaign.name}}' : (f.campaign.value.trim() || 'campaign'));
    u.searchParams.set('utm_content', dyn ? '{{ad.name}}' : (f.content.value.trim() || 'ad'));
    if (dyn) u.searchParams.set('utm_term', '{{adset.name}}');
    // Meta needs the braces literally, so don't percent-encode them.
    out.value = u.toString().replace(/%7B/g, '{').replace(/%7D/g, '}');
  };
  f.addEventListener('input', build);
  f.addEventListener('change', build);
  build();
  $('[data-copy-link]', root).addEventListener('click', async () => { try { await navigator.clipboard.writeText(out.value); toast('লিংক কপি হয়েছে'); } catch { out.select(); } });
  $('[data-test-event]', root)?.addEventListener('click', async () => {
    try { const r = await api('/tracking/test-event', { method: 'POST', body: {} }); toast(r.sent ? 'পাঠানো হয়েছে — ইভেন্টস ম্যানেজার › Test events দেখুন' : `পাঠানো যায়নি: ${r.reason}`, !r.sent); trackingView(root); } catch (err) { toast(err.message, true); }
  });
}

/* ================= Site preview with click-to-edit ================= */
const DEVICES = [['desktop', '🖥 ডেস্কটপ', 1280], ['tablet', '📱 ট্যাবলেট', 820], ['mobile', '📱 মোবাইল', 390]];
const EDIT_ROUTES = {
  package: (id) => `#/packages/${id}`, faqs: (id) => `#/packages/${id}`, design: (id) => `#/designs/${id}`,
  portfolio: (id) => `#/portfolio/${id}`, category: (id) => `#/categories/${id}`, settings: () => '#/settings',
  course: (id) => `#/courses/${id}`, 'course-category': (id) => `#/course-categories/${id}`,
};
const EDIT_CSS = `[data-edit]{outline:2px dashed rgba(139,92,246,.85)!important;outline-offset:3px;cursor:pointer!important;position:relative}
[data-edit]:hover{outline:3px solid #f59e0b!important}
[data-edit]::after{content:"✎ এডিট";position:absolute;top:6px;right:6px;z-index:70;background:#8b5cf6;color:#fff;font:700 12px/1.2 system-ui,sans-serif;padding:3px 9px;border-radius:999px;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.35)}
[data-edit]:hover::after{background:#f59e0b;color:#1c1205}`;

export async function previewView(root, startPath) {
  const pkgs = state.lookups.packages || [];
  const pages = [['/', 'হোমপেজ'], ['/packages', 'সব প্যাকেজ'], ['/designs', 'ডিজাইন গ্যালারি'], ['/portfolio', 'সফল ডেলিভারি'], ['/contact', 'যোগাযোগ'], ['/faq', 'প্রশ্নোত্তর'], ['/about', 'আমাদের সম্পর্কে'],
    ...pkgs.map((p) => [`/package/${p.slug}`, `প্যাকেজ: ${p.name}`])];
  const safePath = /^\/[\w\-/]*$/.test(startPath) && !startPath.startsWith('/admin') && !startPath.startsWith('/api') ? startPath : '/';
  let device = localStorage.getItem('adm_prev_device') || 'desktop';
  let editMode = localStorage.getItem('adm_prev_edit') !== '0';
  root.innerHTML = `
    <div class="page-head"><h1>সাইট প্রিভিউ ও এডিট</h1><div class="actions"><a class="btn" data-open-tab href="${esc(safePath)}" target="_blank" rel="noopener">নতুন ট্যাবে ↗</a></div></div>
    <p class="muted small">পুরো সাইট এখানে আসল চেহারায় দেখুন। <b>এডিট মোড</b> চালু থাকলে বেগুনি দাগ দেওয়া যেকোনো অংশে চাপ দিন — প্যাকেজ, ডিজাইন, সফল ডেলিভারি, প্রশ্নোত্তর, ক্যাটাগরি বা সাইটের লেখা/যোগাযোগ সেটিংস সাথে সাথে এডিটে খুলবে। এডিট মোড বন্ধ করলে সাধারণ ভিজিটরের মতো ঘুরে দেখা যায়। প্রিভিউতে কোনো পিক্সেল/অ্যানালিটিক্স চলে না।</p>
    <div class="prev-bar">
      <select data-page aria-label="পেজ বাছাই">${pages.map(([v, l]) => `<option value="${esc(v)}" ${v === safePath ? 'selected' : ''}>${esc(l)}</option>`).join('')}${pages.some(([v]) => v === safePath) ? '' : `<option value="${esc(safePath)}" selected>${esc(safePath)}</option>`}</select>
      <div class="seg" role="group" aria-label="স্ক্রিন">${DEVICES.map(([k, l]) => `<button type="button" class="btn sm ${k === device ? 'primary' : ''}" data-device="${k}">${l}</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" data-edit-mode ${editMode ? 'checked' : ''}> ✎ এডিট মোড</label>
      <button type="button" class="btn sm" data-reload title="আবার লোড করুন">↻ রিফ্রেশ</button>
    </div>
    <div class="prev-stage" data-stage><div class="prev-frame" data-wrap><iframe data-frame title="সাইট প্রিভিউ" src="${esc(safePath)}"></iframe></div></div>`;

  const stage = $('[data-stage]', root);
  const wrap = $('[data-wrap]', root);
  const frame = $('[data-frame]', root);
  const select = $('[data-page]', root);
  const fit = () => {
    const w = DEVICES.find(([k]) => k === device)[2];
    const avail = stage.clientWidth - 24;
    const scale = Math.min(1, avail / w);
    const h = Math.max(480, stage.clientHeight - 24);
    wrap.style.width = `${w}px`;
    wrap.style.height = `${h / scale}px`;
    wrap.style.transform = `scale(${scale})`;
    wrap.style.marginBottom = `${-(h / scale) * (1 - scale)}px`;
  };
  const decorate = () => {
    let doc;
    try { doc = frame.contentDocument; } catch { return; }
    if (!doc || !doc.head) return;
    const path = frame.contentWindow.location.pathname;
    if ([...select.options].some((o) => o.value === path)) select.value = path;
    $('[data-open-tab]', root).href = path;
    let st = doc.getElementById('adm-edit-style');
    if (editMode && !st) { st = doc.createElement('style'); st.id = 'adm-edit-style'; st.textContent = EDIT_CSS; doc.head.append(st); }
    if (!editMode && st) st.remove();
    if (!doc.documentElement.dataset.admBound) {
      doc.documentElement.dataset.admBound = '1';
      doc.addEventListener('click', (e) => {
        if (!editMode) return;
        const el = e.target.closest('[data-edit]');
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        const [type, id] = el.dataset.edit.split(':');
        const to = EDIT_ROUTES[type];
        if (to) location.hash = to(id);
      }, true);
    }
  };
  frame.addEventListener('load', decorate);
  select.addEventListener('change', () => { frame.src = select.value; });
  $('[data-reload]', root).addEventListener('click', () => frame.contentWindow.location.reload());
  $$('[data-device]', root).forEach((b) => b.addEventListener('click', () => {
    device = b.dataset.device;
    localStorage.setItem('adm_prev_device', device);
    $$('[data-device]', root).forEach((x) => x.classList.toggle('primary', x === b));
    fit();
  }));
  $('[data-edit-mode]', root).addEventListener('change', (e) => {
    editMode = e.target.checked;
    localStorage.setItem('adm_prev_edit', editMode ? '1' : '0');
    decorate();
  });
  new ResizeObserver(fit).observe(stage);
  fit();
}

/* ================= Help ================= */
export function helpView(root) {
  root.innerHTML = `<div class="card help" style="max-width:860px"><h1>সহায়তা কেন্দ্র</h1>
  <h2>নতুন প্যাকেজ যোগ করা</h2><ol><li>বাম মেনু › প্যাকেজ › “+ নতুন প্যাকেজ”।</li><li>নাম, দাম ও ফিচার লিখে সংরক্ষণ করুন।</li><li>“এআই দিয়ে সাজেস্ট” চাপলে একটি খসড়া আসবে — পড়ে, সম্পাদনা করে অনুমোদন দিন।</li><li>স্ক্রিনশট ও ছোট ডেমো ভিডিও আপলোড করুন, লাইভ ডেমো লিংক দিন।</li><li>অ্যাড-অন ও অফার ডান পাশ থেকে যোগ করুন।</li></ol>
  <h2>দাম ও ছাড় বদলানো</h2><ol>
    <li><b>প্যাকেজ ও দাম</b> › প্যাকেজ খুলুন › “দাম ও অফার” ট্যাব।</li>
    <li>“নিয়মিত দাম” লিখুন (যেমন ১২০০০), ছাড় দিতে চাইলে “ছাড় %” লিখুন (যেমন ৫০) — নিচে দেখাবে ক্রেতা কী দাম দেখবেন (৳৬,০০০, পাশে ৳১২,০০০ কাটা)।</li>
    <li>“সংরক্ষণ করুন” চাপুন। চেকআউটেও এই দামই নেওয়া হয়। ছাড় বন্ধ করতে “ছাড় %” খালি করে সংরক্ষণ করুন।</li></ol>
  <h2>পাবলিক সাইট কখন আপডেট হয়</h2><p>shop.sayadbayezid.com হলো সাইটের একটি কপি (GitHub Pages)। দাম ও অফার সেখানে সাথে সাথেই ঠিক দেখায়। বাকি লেখা, ছবি বা নতুন প্যাকেজ/কোর্স দেখাতে উপরের “↻ সাইট আপডেট” চাপুন। প্রতিবার নিজে থেকে আপডেট চাইলে একবার এটি করুন:</p><ol>
    <li>GitHub › Settings › Developer settings › Fine-grained tokens › Generate new token — Repository access: শুধু <code>shop.sayadbayezid.com</code>, Permissions › Actions: <b>Read and write</b>।</li>
    <li>রিপোজিটরির Settings › Secrets › Actions › New secret — নাম <code>PAGES_REFRESH_TOKEN</code>, মান: টোকেনটি।</li>
    <li>Actions › “Deploy to Cloudflare Workers” › Run workflow। এরপর প্রতিটি পরিবর্তন ১–২ মিনিটে পাবলিক সাইটে যাবে।</li></ol>
  <h2>গুগল ড্রাইভের প্রাইভেট ভিডিও</h2><ol>
    <li>ভিডিও/ফাইল ড্রাইভে রাখুন, “Share”-এ সার্ভিস অ্যাকাউন্টের ইমেইল (এআই ও গুগল পেজে দেখানো) Viewer হিসেবে যোগ করুন। General access “Restricted” রাখুন।</li>
    <li>কোর্স › লেসন › ভিডিও ঘরে ড্রাইভ লিংকটি দিন। ভর্তি শিক্ষার্থীরা সাইটের ভেতরেই দেখবেন; ড্রাইভ লিংক কারও কাছে যাবে না, আর ভর্তি না হলে কেউ চালাতে পারবে না।</li>
    <li>যাচাই করতে: এআই ও গুগল › লিংক দিয়ে “পরীক্ষা করুন”।</li></ol>
  <h2>কোর্স বিক্রি — শুরু থেকে শেষ</h2><ol>
    <li><b>কোর্স ক্যাটাগরি</b> › “+ নতুন” — যত খুশি ক্যাটাগরি (ডিজিটাল মার্কেটিং, ডেভেলপমেন্ট, পাইথন…)।</li>
    <li><b>কোর্স</b> › “+ নতুন” — নাম, দাম, কভার, পরিচিতি ভিডিও, যা শিখবেন, প্রশ্নোত্তর লিখে সংরক্ষণ করুন।</li>
    <li>কোর্স খুলে <b>অধ্যায়</b> যোগ করুন, তারপর প্রতিটি <b>লেসন</b>: ইউটিউব (আনলিস্টেড) / ড্রাইভ লিংক, প্রাইভেট ভিডিও বা ফাইল আপলোড, প্রাইভেট লিংক ও নোট। ১–২টি লেসনে “ফ্রি প্রিভিউ” দিন।</li>
    <li>অবস্থা “প্রকাশিত” করুন — সেলস পেজ (/course/…) ও বিজ্ঞাপনের পেজ (/lp/course/…) চালু হবে।</li>
    <li>শিক্ষার্থী ভর্তি ফর্মে নাম, মোবাইল ও পাসওয়ার্ড দিয়ে পেমেন্ট করেন। গেটওয়ে পেমেন্ট সাথে সাথে, সেন্ড মানি হলে <b>অর্ডার</b> থেকে আপনি যাচাই করলে — তখনই কোর্সটি তার প্রোফাইলে (“আমার কোর্স”) খোলে। তার আগে কোনো লেসন দেখা যায় না।</li>
    <li>পাসওয়ার্ড ভুলে গেলে: <b>শিক্ষার্থী</b> › সম্পাদনা › নতুন পাসওয়ার্ড। উপহার / অফলাইন পেমেন্ট: <b>কোর্স এক্সেস</b> › “+ নতুন”।</li></ol>
  <p class="small muted">বিজ্ঞাপন ট্র্যাকিং: কোর্স পেজ দেখলে ViewContent, ভর্তি ফর্ম জমা দিলে InitiateCheckout, আর আসল পেমেন্ট নিশ্চিত হলেই Purchase — পিক্সেল, কনভার্সন এপিআই ও জিএ৪ তিন জায়গাতেই একই ইভেন্ট আইডিতে (দুবার গোনা হয় না)। ফ্রি কোর্সে Purchase যায় না।</p>
  <h2>অফার ও টাইমার</h2><p>অফারের “শেষ” সময় পার হলেই সার্ভার নিজে থেকে ছাড় দেওয়া বন্ধ করে দেয় — টাইমার শুধু দেখানোর জন্য নয়।</p>
  <h2>বিজ্ঞাপনের জন্য ল্যান্ডিং পেজ</h2><ol><li>ল্যান্ডিং পেজ › নতুন — ব্লক যোগ করে পেজ সাজান।</li><li>“সংরক্ষণ ও প্রকাশ” করুন। বিজ্ঞাপনে যে লিংক দেবেন তা পেজের উপরে দেখানো আছে — utm_content এ বিজ্ঞাপনের নাম দিন, তাহলে রিপোর্টে প্রতিটি ক্রিয়েটিভের ফল আলাদা দেখা যাবে।</li><li>ক্যাম্পেইন শেষ হলে “অবসরে পাঠান”।</li></ol>
  <h2>অর্ডারের ধাপ</h2><p>পেমেন্টের অপেক্ষায় → নিশ্চিত → তথ্য সংগ্রহ → ডেভেলপমেন্ট → ক্লায়েন্ট রিভিউ → সংশোধন → ডেলিভারি → সম্পূর্ণ। প্রতিটি ধাপ বদলালে ক্লায়েন্ট স্বয়ংক্রিয়ভাবে বার্তা পান। পেমেন্ট নিশ্চিত না হলে প্রজেক্ট সামনে এগোনো যায় না।</p>
  <h2>ব্যাংক / সেন্ড মানি পেমেন্ট</h2><p>ক্লায়েন্ট ট্রানজেকশন আইডি দিলে অর্ডারটি “যাচাই প্রয়োজন” হিসেবে আসবে। ব্যাংক বা মোবাইল ওয়ালেটের স্টেটমেন্টে টাকা দেখে তবেই নিশ্চিত করুন। নিশ্চিত করলেই ইনভয়েস নম্বর তৈরি হয় এবং মেটা-তে “পারচেজ” ইভেন্ট যায় — তাই অনুমানের ভিত্তিতে কখনো নিশ্চিত করবেন না।</p>
  <h2>সৎ সামাজিক প্রমাণ</h2><p>হোমপেজের ক্লায়েন্ট সংখ্যা ও রেটিং আসল অর্ডার ও অনুমোদিত রিভিউ থেকে হিসাব হয়। “যাচাইকৃত” ব্যাজ শুধু আসল অর্ডারের পোর্টাল থেকে আসা রিভিউতে দেখায়।</p>
  <h2>নিরাপত্তা</h2><ul><li>প্রতিটি স্টাফের আলাদা অ্যাকাউন্ট দিন, প্রয়োজনের চেয়ে বেশি অনুমতি দেবেন না।</li><li>ক্লায়েন্টের প্রজেক্ট তথ্য দেখলে তা অ্যাক্টিভিটি লগে রেকর্ড হয়।</li><li>কোনো এপিআই কী বা পাসওয়ার্ড চ্যাটে/ইমেইলে শেয়ার করবেন না।</li></ul></div>`;
}
