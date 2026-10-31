import { $, $$, api, bn, taka, esc, fmtDate, toast, listView, statusPill, yesNo, can, state, openForm } from './core.js';
import * as V from './views.js';

const app = $('#app');
const NAV = [
  ['dashboard', 'ড্যাশবোর্ড', '◧'], ['categories', 'ক্যাটাগরি', '▦'], ['packages', 'প্যাকেজ', '◫'], ['landing-pages', 'ল্যান্ডিং পেজ', '⬚'],
  ['orders', 'অর্ডার / প্রজেক্ট', '🧾'], ['leads', 'লিড', '☏'], ['coupons', 'কুপন', '%'], ['offers', 'ক্যাটাগরি অফার', '⏱'], ['banners', 'ব্যানার / পপআপ', '▭'],
  ['faqs', 'প্রশ্নোত্তর', '?'], ['reviews', 'রিভিউ', '★'], ['chats', 'চ্যাট', '💬'], ['chat-settings', 'চ্যাট সেটিংস', '⚙'], ['ai-settings', 'এআই সেটিংস', '✨'],
  ['reports', 'রিপোর্ট', '📈'], ['staff', 'স্টাফ ও ভূমিকা', '👥'], ['activity', 'অ্যাক্টিভিটি লগ', '≡'], ['settings', 'সিস্টেম সেটিংস', '⚒'], ['help', 'সহায়তা কেন্দ্র', 'ⓘ'],
];
const ROLE = { super_admin: 'সুপার অ্যাডমিন', sales_support: 'সেলস / সাপোর্ট', project_manager: 'প্রজেক্ট ম্যানেজার', viewer: 'শুধু দেখার অনুমতি' };

/* ---------------- Auth screens ---------------- */
async function loginScreen() {
  const st = await api('/auth/status').catch(() => ({ needsSetup: false }));
  app.className = 'login';
  if (st.needsSetup) {
    app.innerHTML = `<form class="card"><h1>প্রথমবার সেটআপ</h1><p class="muted small">প্রথম সুপার অ্যাডমিন অ্যাকাউন্ট তৈরি করুন। সেটআপ টোকেনটি <code>wrangler secret put ADMIN_SETUP_TOKEN</code> দিয়ে দেওয়া হয়েছে।</p>
      <label>সেটআপ টোকেন<input name="token" type="password" required autocomplete="off"></label><label>আপনার নাম<input name="name" required></label><label>ইমেইল<input name="email" type="email" required autocomplete="username"></label>
      <label>পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)<input name="password" type="password" minlength="10" required autocomplete="new-password"></label><button class="btn primary">অ্যাকাউন্ট তৈরি করুন</button><p class="err" data-msg></p></form>`;
    $('form', app).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/auth/setup', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('অ্যাকাউন্ট তৈরি হয়েছে, এবার লগইন করুন'); loginScreen(); } catch (err) { $('[data-msg]', app).textContent = err.message; }
    });
    return;
  }
  app.innerHTML = `<form class="card"><h1>অ্যাডমিন লগইন</h1><label>ইমেইল<input name="email" type="email" required autocomplete="username"></label><label>পাসওয়ার্ড<input name="password" type="password" required autocomplete="current-password"></label><button class="btn primary">লগইন</button><p class="err" data-msg role="alert"></p></form>`;
  $('form', app).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); location.hash = '#/dashboard'; boot(); } catch (err) { $('[data-msg]', app).textContent = err.message; }
  });
}

/* ---------------- Shell ---------------- */
function shell() {
  app.className = '';
  const collapsed = localStorage.getItem('adm_collapsed') === '1';
  app.innerHTML = `<div class="shell ${collapsed ? 'collapsed' : ''}">
    <nav class="side" aria-label="অ্যাডমিন মেনু"><div class="brand"><i>&lt;/&gt;</i><b>অ্যাডমিন</b></div>
      ${NAV.map(([k, l, ic]) => `<a href="#/${k}" data-nav="${k}"><span class="ic" aria-hidden="true">${ic}</span><span class="lbl">${esc(l)}</span>${k === 'leads' || k === 'chats' ? `<span class="badge-n" data-count="${k}" hidden></span>` : ''}</a>`).join('')}
      <a href="#" class="collapse-btn" data-collapse><span class="ic">⇆</span><span class="lbl">মেনু ছোট করুন</span></a></nav>
    <main class="main"><div class="topbar"><button class="btn icon" data-open-side aria-label="মেনু">☰</button><button class="btn icon" data-open-right aria-label="নোটিফিকেশন">🔔 <span data-unread-top></span></button></div><div data-view></div></main>
    <aside class="right" aria-label="দ্রুত তথ্য">
      <div style="display:flex;gap:.5rem;align-items:center">
        <form data-search style="flex:1"><input type="search" name="q" placeholder="অর্ডার, লিড খুঁজুন…" aria-label="খুঁজুন"></form>
        <div class="profile"><button class="btn icon" data-profile aria-haspopup="menu">👤</button><div class="profile-menu" hidden data-profile-menu>
          <div style="padding:.5rem .7rem"><b>${esc(state.me.name)}</b><br><span class="small muted">${esc(ROLE[state.me.role])}</span></div>
          <button data-theme>থিম পরিবর্তন</button><button data-pw>পাসওয়ার্ড পরিবর্তন</button><a href="/" target="_blank" rel="noopener">সাইট দেখুন ↗</a><button data-logout>লগআউট</button></div></div>
      </div>
      <section><div style="display:flex;justify-content:space-between;align-items:center"><h3>নোটিফিকেশন <span data-unread class="pill info" hidden></span></h3><button class="btn sm" data-mark-read>সব পড়া হয়েছে</button></div><ul class="notif-list" data-notifs><li class="muted">লোড হচ্ছে…</li></ul></section>
      <section><h3>স্টাফ</h3><ul class="staff-list" data-staff></ul></section>
    </aside></div>`;

  $('[data-collapse]', app).addEventListener('click', (e) => { e.preventDefault(); const s = $('.shell', app); s.classList.toggle('collapsed'); localStorage.setItem('adm_collapsed', s.classList.contains('collapsed') ? '1' : '0'); });
  $('[data-open-side]', app).addEventListener('click', () => $('.side', app).classList.toggle('open'));
  $('[data-open-right]', app).addEventListener('click', () => $('.right', app).classList.toggle('open'));
  $('[data-profile]', app).addEventListener('click', () => { const m = $('[data-profile-menu]', app); m.hidden = !m.hidden; });
  $('[data-theme]', app).addEventListener('click', () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); });
  $('[data-logout]', app).addEventListener('click', async () => { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); location.hash = '#/login'; boot(); });
  $('[data-pw]', app).addEventListener('click', () => openForm({ title: 'পাসওয়ার্ড পরিবর্তন', fields: [{ name: 'current', label: 'বর্তমান পাসওয়ার্ড', inputType: 'password', required: true }, { name: 'next', label: 'নতুন পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)', inputType: 'password', required: true }], onSubmit: (d) => api('/auth/password', { method: 'POST', body: d }) }));
  $('[data-mark-read]', app).addEventListener('click', async () => { await api('/notifications/read', { method: 'POST', body: {} }); refreshSidebar(); });
  $('[data-search]', app).addEventListener('submit', (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (!q) return; sessionStorage.setItem('adm_search', q); location.hash = /^(ORD|INV)-/i.test(q) || /^\d{6,}/.test(q) ? '#/orders' : '#/leads'; });
  refreshSidebar();
  setInterval(refreshSidebar, 60000);
}

async function refreshSidebar() {
  try {
    const [n, dash] = await Promise.all([api('/notifications'), api('/dashboard')]);
    $('[data-notifs]', app).innerHTML = n.items.slice(0, 15).map((x) => `<li class="${x.read_at ? '' : 'unread'}"><a href="${esc(x.link || '#/dashboard')}">${esc(x.title)}</a><br><span class="small muted">${fmtDate(x.created_at)}</span></li>`).join('') || '<li class="muted">কোনো নোটিফিকেশন নেই</li>';
    const u = $('[data-unread]', app); u.hidden = !n.unread; u.textContent = bn(n.unread);
    $('[data-unread-top]', app).textContent = n.unread ? bn(n.unread) : '';
    $('[data-staff]', app).innerHTML = dash.staff.map((s) => `<li><span class="dot ${s.online ? 'on' : ''}"></span>${esc(s.name)} <span class="small muted">${esc(ROLE[s.role])}</span></li>`).join('');
    const setCount = (k, v) => { const el = $(`[data-count="${k}"]`, app); if (el) { el.hidden = !v; el.textContent = bn(v); } };
    setCount('leads', dash.attention.newLeads.length);
    setCount('chats', dash.attention.escalatedChats.length);
  } catch {}
}

/* ---------------- Resource configs ---------------- */
const catOpts = () => state.lookups.categories.map((c) => [c.id, c.name]);
const pkgOpts = () => state.lookups.packages.map((p) => [p.id, p.name]);
const catName = (id) => state.lookups.categories.find((c) => c.id === id)?.name || '—';
const pkgName = (id) => state.lookups.packages.find((p) => p.id === id)?.name || '—';
const refreshLookups = async () => { state.lookups = await api('/lookups'); };

const R = {
  categories: {
    title: 'ক্যাটাগরি', singular: 'ক্যাটাগরি', endpoint: '/categories', writePerm: 'catalog.write',
    filters: [{ name: 'is_active', label: 'অবস্থা', options: [['1', 'সক্রিয়'], ['0', 'নিষ্ক্রিয়']] }],
    columns: [{ label: 'নাম', render: (c) => `${esc(c.icon)} <b>${esc(c.name)}</b><br><span class="small muted">/category/${esc(c.slug)}</span>` }, { label: 'বিবরণ', render: (c) => `<span class="small">${esc(c.description)}</span>` }, { label: 'ক্রম', render: (c) => bn(c.sort_order) }, { label: 'অবস্থা', render: (c) => yesNo(c.is_active) }],
    fields: [{ name: 'name', label: 'নাম', required: true }, { name: 'slug', label: 'স্লাগ', required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*', hint: 'যেমন fashion' }, { name: 'description', label: 'বিবরণ', type: 'textarea', rows: 2 }, { name: 'icon', label: 'আইকন (ইমোজি)', max: 8 }, { name: 'image_key', label: 'ছবি', type: 'image' }, { name: 'sort_order', label: 'ক্রম', type: 'number', default: 0 }, { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 }],
    newValues: { is_active: 1, sort_order: 0 },
    rowActions: [{ key: 'offer', label: 'অফার', perm: 'marketing.write', run: (c) => { location.hash = `#/offers?cat=${c.id}`; } }],
    after: refreshLookups,
  },
  packages: {
    title: 'প্যাকেজ', endpoint: '/packages', writePerm: 'catalog.write', fields: null,
    filters: [{ name: 'category_id', label: 'ক্যাটাগরি', options: catOpts }, { name: 'status', label: 'অবস্থা', options: [['active', 'সক্রিয়'], ['inactive', 'নিষ্ক্রিয়'], ['coming_soon', 'শীঘ্রই আসছে']] }],
    columns: [
      { label: 'প্যাকেজ', render: (p) => `<a href="#/packages/${p.id}"><b>${esc(p.name)}</b></a>${p.ai_draft ? ' ' + statusPill('এআই খসড়া অপেক্ষায়', 'warn') : ''}<br><span class="small muted">${esc(catName(p.category_id))}</span>` },
      { label: 'দাম', render: (p) => taka(p.base_price) }, { label: 'ডেমো', render: (p) => (p.demo_url ? `<a href="${esc(p.demo_url)}" target="_blank" rel="noopener">লিংক ↗</a>` : statusPill('নেই', 'warn')) },
      { label: 'অবস্থা', render: (p) => statusPill({ active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়', coming_soon: 'শীঘ্রই আসছে' }[p.status], p.status === 'active' ? 'ok' : p.status === 'inactive' ? 'bad' : 'warn') + (p.is_featured ? ' ' + statusPill('হোমপেজে') : '') },
    ],
    onCreate: () => { location.hash = '#/packages/new'; },
    onOpen: (p) => { location.hash = `#/packages/${p.id}`; },
  },
  'landing-pages': {
    title: 'ল্যান্ডিং পেজ', endpoint: '/landing-pages', writePerm: 'marketing.write', titleKey: 'title', intro: 'প্রতিটি বিজ্ঞাপন ক্যাম্পেইনের জন্য আলাদা পেজ — নিজস্ব হিরো, অফার ও ট্র্যাকিংসহ। মেনুতে দেখা যায় না।',
    filters: [{ name: 'status', label: 'অবস্থা', options: [['draft', 'খসড়া'], ['published', 'প্রকাশিত'], ['retired', 'অবসরপ্রাপ্ত']] }],
    columns: [{ label: 'পেজ', render: (l) => `<a href="#/landing-pages/${l.id}"><b>${esc(l.title)}</b></a><br><span class="small muted">/lp/${esc(l.slug)}</span>` }, { label: 'ক্যাম্পেইন', render: (l) => esc(l.utm_campaign || '—') }, { label: 'অবস্থা', render: (l) => statusPill({ draft: 'খসড়া', published: 'প্রকাশিত', retired: 'অবসরপ্রাপ্ত' }[l.status], l.status === 'published' ? 'ok' : l.status === 'retired' ? 'bad' : 'warn') }, { label: 'হালনাগাদ', render: (l) => `<span class="small">${fmtDate(l.updated_at)}</span>` }],
    onCreate: () => { location.hash = '#/landing-pages/new'; },
    onOpen: (l) => { location.hash = `#/landing-pages/${l.id}`; },
  },
  coupons: {
    title: 'কুপন', singular: 'কুপন', endpoint: '/coupons', writePerm: 'marketing.write', titleKey: 'code',
    filters: [{ name: 'is_active', label: 'অবস্থা', options: [['1', 'সক্রিয়'], ['0', 'নিষ্ক্রিয়']] }, { name: 'scope', label: 'প্রযোজ্য', options: [['sitewide', 'পুরো সাইট'], ['category', 'ক্যাটাগরি'], ['package', 'প্যাকেজ']] }],
    columns: [
      { label: 'কোড', render: (c) => `<b>${esc(c.code)}</b>${c.referrer_order_id ? ' ' + statusPill('রেফারেল', 'info') : ''}<br><span class="small muted">${esc(c.description)}</span>` },
      { label: 'ছাড়', render: (c) => (c.discount_type === 'percent' ? bn(c.discount_value) + '%' : taka(c.discount_value)) },
      { label: 'প্রযোজ্য', render: (c) => (c.scope === 'sitewide' ? 'পুরো সাইট' : c.scope === 'category' ? catName(c.scope_id) : pkgName(c.scope_id)) },
      { label: 'ব্যবহার', render: (c) => `${bn(c.used_count)}${c.usage_limit ? ' / ' + bn(c.usage_limit) : ''}` },
      { label: 'মেয়াদ', render: (c) => `<span class="small">${c.expires_at ? fmtDate(c.expires_at) : 'সীমাহীন'}</span>` }, { label: '', render: (c) => yesNo(c.is_active) },
    ],
    fields: [
      { name: 'code', label: 'কোড', required: true, pattern: '[A-Za-z0-9_-]{3,40}', hint: 'ইংরেজি বড় হাতের অক্ষর/সংখ্যা' }, { name: 'description', label: 'বিবরণ' },
      { name: 'discount_type', label: 'ছাড়ের ধরন', type: 'select', options: [['percent', 'শতকরা (%)'], ['flat', 'নির্দিষ্ট টাকা (৳)']], required: true }, { name: 'discount_value', label: 'ছাড়ের পরিমাণ', type: 'number', min: 1, required: true },
      { name: 'scope', label: 'প্রযোজ্য', type: 'select', options: [['sitewide', 'পুরো সাইট'], ['category', 'একটি ক্যাটাগরি'], ['package', 'একটি প্যাকেজ']], required: true },
      { name: 'scope_id', label: 'ক্যাটাগরি / প্যাকেজ', type: 'select', numeric: true, options: () => [...catOpts().map(([i, n]) => [i, 'ক্যাটাগরি: ' + n]), ...pkgOpts().map(([i, n]) => [i, 'প্যাকেজ: ' + n])], hint: 'প্রযোজ্যের সাথে মিলিয়ে বাছুন' },
      { name: 'starts_at', label: 'শুরু', type: 'datetime' }, { name: 'expires_at', label: 'মেয়াদ শেষ', type: 'datetime' },
      { name: 'usage_limit', label: 'ব্যবহার সীমা (খালি = সীমাহীন)', type: 'number', min: 1 }, { name: 'min_subtotal', label: 'ন্যূনতম অর্ডার (৳)', type: 'number', min: 0, default: 0 },
      { name: 'show_on_card', label: 'প্যাকেজ কার্ডে কোডটি দেখান', type: 'bool' }, { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 },
    ],
    newValues: { discount_type: 'percent', scope: 'sitewide', is_active: 1, min_subtotal: 0 },
  },
  offers: {
    title: 'ক্যাটাগরি অফার ও টাইমার', singular: 'অফার', endpoint: '/offers', writePerm: 'marketing.write', titleKey: 'title', search: false, defaultFilters: { scope: 'category' },
    intro: 'পুরো ক্যাটাগরিতে ছাড়। একটি নির্দিষ্ট প্যাকেজের অফার প্যাকেজ এডিটর থেকে দিন।',
    filters: [{ name: 'scope_id', label: 'ক্যাটাগরি', options: catOpts }],
    columns: [{ label: 'ক্যাটাগরি', render: (o) => esc(catName(o.scope_id)) }, ...V.offerListCfg('category', 0).columns],
    fields: [{ name: 'scope_id', label: 'ক্যাটাগরি', type: 'select', options: catOpts, required: true, numeric: true }, ...V.offerFields()],
    newValues: { discount_type: 'percent', show_timer: 1, is_active: 1 }, toApi: (d) => ({ ...d, scope: 'category' }),
  },
  banners: {
    title: 'ব্যানার ও পপআপ', singular: 'ব্যানার', endpoint: '/banners', writePerm: 'marketing.write', titleKey: 'title',
    filters: [{ name: 'kind', label: 'ধরন', options: [['bar', 'উপরের ব্যানার'], ['popup', 'পপআপ']] }],
    columns: [{ label: 'শিরোনাম', render: (b) => `<b>${esc(b.title)}</b><br><span class="small muted">${esc(b.body)}</span>` }, { label: 'ধরন', render: (b) => (b.kind === 'bar' ? 'উপরের ব্যানার' : 'পপআপ') }, { label: 'কোথায়', render: (b) => esc({ all: 'সব পেজ', home: 'হোম', category: 'ক্যাটাগরি', package: 'প্যাকেজ', landing: 'ল্যান্ডিং' }[b.target]) }, { label: 'সময়', render: (b) => `<span class="small">${b.starts_at ? fmtDate(b.starts_at) : '—'} → ${b.ends_at ? fmtDate(b.ends_at) : '—'}</span>` }, { label: '', render: (b) => yesNo(b.is_active) }],
    fields: [{ name: 'kind', label: 'ধরন', type: 'select', options: [['bar', 'উপরের ব্যানার'], ['popup', 'পপআপ']], required: true }, { name: 'title', label: 'শিরোনাম', required: true }, { name: 'body', label: 'লেখা', type: 'textarea', rows: 2 }, { name: 'cta_label', label: 'বোতামের লেখা' }, { name: 'cta_url', label: 'বোতামের লিংক', placeholder: '/category/fashion' }, { name: 'image_key', label: 'ছবি (পপআপের জন্য)', type: 'image' }, { name: 'target', label: 'কোথায় দেখাবে', type: 'select', options: [['all', 'সব পেজ'], ['home', 'হোম'], ['category', 'ক্যাটাগরি পেজ'], ['package', 'প্যাকেজ পেজ'], ['landing', 'ল্যান্ডিং পেজ']] }, { name: 'starts_at', label: 'শুরু', type: 'datetime' }, { name: 'ends_at', label: 'শেষ', type: 'datetime' }, { name: 'sort_order', label: 'ক্রম', type: 'number', default: 0 }, { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 }],
    newValues: { kind: 'bar', target: 'all', is_active: 1 },
  },
  faqs: {
    title: 'প্রশ্নোত্তর', singular: 'প্রশ্ন', endpoint: '/faqs', writePerm: 'marketing.write', titleKey: 'question',
    filters: [{ name: 'scope', label: 'প্রযোজ্য', options: [['sitewide', 'পুরো সাইট'], ['package', 'প্যাকেজ']] }, { name: 'package_id', label: 'প্যাকেজ', options: pkgOpts }],
    columns: [{ label: 'প্রশ্ন', render: (f) => `<b>${esc(f.question)}</b><br><span class="small muted">${esc(f.answer.slice(0, 120))}</span>` }, { label: 'প্রযোজ্য', render: (f) => (f.scope === 'sitewide' ? 'পুরো সাইট' : esc(pkgName(f.package_id))) }, { label: '', render: (f) => yesNo(f.is_active) }],
    fields: [{ name: 'question', label: 'প্রশ্ন', required: true }, { name: 'answer', label: 'উত্তর', type: 'textarea', required: true }, { name: 'scope', label: 'প্রযোজ্য', type: 'select', options: [['sitewide', 'পুরো সাইট'], ['package', 'নির্দিষ্ট প্যাকেজ']], required: true }, { name: 'package_id', label: 'প্যাকেজ', type: 'select', options: pkgOpts, numeric: true }, { name: 'sort_order', label: 'ক্রম', type: 'number', default: 0 }, { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 }],
    newValues: { scope: 'sitewide', is_active: 1 },
  },
  reviews: {
    title: 'রিভিউ', singular: 'রিভিউ', endpoint: '/reviews', writePerm: 'reviews.write', titleKey: 'author_name', defaultFilters: { status: 'pending' }, exportUrl: '/reviews-export.csv',
    intro: '“যাচাইকৃত” ব্যাজ শুধু আসল অর্ডারের পোর্টাল থেকে জমা হওয়া রিভিউতে থাকে — এটি হাতে বদলানো যায় না।',
    filters: [{ name: 'status', label: 'অবস্থা', options: [['pending', 'অপেক্ষায়'], ['approved', 'অনুমোদিত'], ['rejected', 'প্রত্যাখ্যাত']] }],
    columns: [{ label: 'রিভিউ', render: (r) => `<b>${esc(r.author_name)}</b> ${'★'.repeat(r.rating)}${r.is_verified ? ' ' + statusPill('✓ যাচাইকৃত', 'ok') : ''}<br><span class="small">${esc(r.body)}</span>` }, { label: 'প্যাকেজ', render: (r) => esc(pkgName(r.package_id)) }, { label: 'অবস্থা', render: (r) => statusPill({ pending: 'অপেক্ষায়', approved: 'অনুমোদিত', rejected: 'প্রত্যাখ্যাত' }[r.status], r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn') }],
    rowActions: [
      { key: 'ap', label: 'অনুমোদন', perm: 'reviews.write', show: (r) => r.status !== 'approved', run: async (r, reload) => { await api(`/reviews/${r.id}`, { method: 'PUT', body: { status: 'approved' } }); toast('অনুমোদিত'); reload(); } },
      { key: 'rj', label: 'প্রত্যাখ্যান', perm: 'reviews.write', show: (r) => r.status !== 'rejected', run: async (r, reload) => { await api(`/reviews/${r.id}`, { method: 'PUT', body: { status: 'rejected' } }); reload(); } },
    ],
    fields: [{ name: 'author_name', label: 'নাম', required: true }, { name: 'author_business', label: 'ব্যবসা' }, { name: 'package_id', label: 'প্যাকেজ', type: 'select', options: pkgOpts, numeric: true }, { name: 'rating', label: 'রেটিং (১–৫)', type: 'number', min: 1, required: true }, { name: 'body', label: 'রিভিউ', type: 'textarea', required: true }, { name: 'status', label: 'অবস্থা', type: 'select', options: [['pending', 'অপেক্ষায়'], ['approved', 'অনুমোদিত'], ['rejected', 'প্রত্যাখ্যাত']] }],
    newValues: { rating: 5, status: 'pending' },
  },
  staff: {
    title: 'স্টাফ ও ভূমিকা', singular: 'স্টাফ', endpoint: '/staff', writePerm: 'staff.write',
    intro: 'সুপার অ্যাডমিন: সব কিছু · সেলস/সাপোর্ট: অর্ডার, লিড, চ্যাট, মার্কেটিং · প্রজেক্ট ম্যানেজার: প্রজেক্টের ধাপ ও ডেলিভারি · শুধু দেখার অনুমতি: কিছু বদলাতে পারবেন না।',
    columns: [{ label: 'নাম', render: (a) => `<b>${esc(a.name)}</b><br><span class="small muted">${esc(a.email)}</span>` }, { label: 'ভূমিকা', render: (a) => esc(ROLE[a.role]) }, { label: 'শেষ লগইন', render: (a) => `<span class="small">${fmtDate(a.last_login_at)}</span>` }, { label: '', render: (a) => yesNo(a.is_active) }],
    fields: (row) => [{ name: 'name', label: 'নাম', required: true }, { name: 'email', label: 'ইমেইল', inputType: 'email', required: true }, { name: 'role', label: 'ভূমিকা', type: 'select', options: Object.entries(ROLE), required: true }, { name: 'password', label: row ? 'নতুন পাসওয়ার্ড (বদলাতে চাইলে)' : 'পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)', inputType: 'password', required: !row }, { name: 'is_active', label: 'সক্রিয়', type: 'bool', default: 1 }],
    newValues: { role: 'sales_support', is_active: 1 },
    toApi: (d) => { if (!d.password) delete d.password; return d; },
  },
  activity: {
    title: 'অ্যাক্টিভিটি লগ', endpoint: '/activity', allowCreate: false, allowDelete: false, writePerm: 'audit.read',
    columns: [{ label: 'সময়', render: (a) => `<span class="small">${fmtDate(a.created_at)}</span>` }, { label: 'স্টাফ', render: (a) => esc(state.lookups.staff.find((s) => s.id === a.admin_id)?.name || (a.admin_id ? '#' + a.admin_id : '—')) }, { label: 'কাজ', render: (a) => `<b>${esc(a.action)}</b> · ${esc(a.entity)} ${esc(a.entity_id || '')}` }, { label: 'বিস্তারিত', render: (a) => `<code class="small">${esc(a.details.slice(0, 160))}</code>` }, { label: 'আইপি', render: (a) => `<span class="small">${esc(a.ip)}</span>` }],
  },
};

/* ---------------- Router ---------------- */
async function route() {
  const hash = location.hash.slice(2) || 'dashboard';
  const [path, query] = hash.split('?');
  const [name, id] = path.split('/');
  if (name === 'login') return loginScreen();
  if (!state.me) return boot();
  if (!$('.shell')) shell();
  $$('[data-nav]', app).forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  $('.side', app).classList.remove('open');
  $('.right', app).classList.remove('open');
  const view = $('[data-view]', app);
  const fresh = view.cloneNode(false); // drop old listeners
  view.replaceWith(fresh);
  fresh.innerHTML = '<p class="muted">লোড হচ্ছে…</p>';
  try {
    const q = sessionStorage.getItem('adm_search');
    if (name === 'dashboard') await V.dashboard(fresh);
    else if (name === 'orders') { await V.ordersView(fresh); if (id) V.openOrder(Number(id)); }
    else if (name === 'leads') { await V.leadsView(fresh); if (id) V.openLead(Number(id)); }
    else if (name === 'packages' && id) await V.packageEditor(fresh, id);
    else if (name === 'landing-pages' && id) await V.landingEditor(fresh, id);
    else if (name === 'chats') await V.chatsView(fresh);
    else if (name === 'chat-settings') await V.chatSettingsView(fresh);
    else if (name === 'ai-settings') await V.aiSettingsView(fresh);
    else if (name === 'reports') await V.reportsView(fresh);
    else if (name === 'settings') await V.settingsView(fresh);
    else if (name === 'help') V.helpView(fresh);
    else if (R[name]) {
      const cfg = { ...R[name] };
      if (name === 'offers' && query) { const cat = new URLSearchParams(query).get('cat'); if (cat) cfg.defaultFilters = { ...cfg.defaultFilters, scope_id: cat }; }
      const reloadLookups = cfg.after;
      if (reloadLookups) { const orig = cfg.toApi; cfg.toApi = (d, r) => { setTimeout(reloadLookups, 300); return orig ? orig(d, r) : d; }; }
      await listView(fresh, cfg);
    } else fresh.innerHTML = '<p>পাতাটি পাওয়া যায়নি</p>';
    if (q && (name === 'orders' || name === 'leads')) {
      sessionStorage.removeItem('adm_search');
      const inp = $('[data-q]', fresh);
      if (inp) { inp.value = q; inp.dispatchEvent(new Event('input')); }
    }
  } catch (err) {
    fresh.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function boot() {
  try {
    state.me = await api('/auth/me');
    state.lookups = await api('/lookups');
  } catch {
    state.me = null;
    return loginScreen();
  }
  shell();
  route();
}

window.addEventListener('hashchange', () => { if (state.me || location.hash === '#/login') route(); });
boot();
