// Admin core: API client, UI primitives, generic CRUD list + slide-over form.
const BN = '০১২৩৪৫৬৭৮৯';
export const bn = (v) => String(v ?? '').replace(/\d/g, (d) => BN[d]);
export const taka = (n) => '৳' + new Intl.NumberFormat('bn-BD').format(Math.round(n || 0));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const fmtDate = (iso, time = true) => (iso ? new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', ...(time ? { timeStyle: 'short', hourCycle: 'h23' } : {}) }).format(new Date(iso)) : '—');
/** ISO → value for <input type=datetime-local> in the admin's local time */
export const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export const state = { me: null, lookups: null };
export const can = (perm) => !!state.me?.permissions?.includes(perm);

export async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: { 'x-requested-with': 'admin' }, credentials: 'same-origin' };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api/admin' + path, opts); } catch { throw Object.assign(new Error('সার্ভারে সংযোগ করা যায়নি'), { code: 'network' }); }
  if (res.status === 401 && !path.startsWith('/auth/')) { location.hash = '#/login'; throw new Error('আবার লগইন করুন'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw Object.assign(new Error(json.error || 'কিছু একটা সমস্যা হয়েছে'), { code: json.code, status: res.status });
  return json.data;
}

export function toast(msg, bad = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  $('.toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

export function confirmDialog(message, okLabel = 'হ্যাঁ, মুছুন') {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'confirm';
    d.innerHTML = `<p>${esc(message)}</p><div style="display:flex;gap:.5rem;justify-content:flex-end"><button class="btn" value="no">বাতিল</button><button class="btn danger" value="yes">${esc(okLabel)}</button></div>`;
    document.body.appendChild(d);
    d.addEventListener('click', (e) => { const v = e.target.closest('button')?.value; if (v) { d.close(); resolve(v === 'yes'); } });
    d.addEventListener('close', () => { d.remove(); resolve(false); });
    d.showModal();
  });
}

/** Slide-over panel. Returns { el, body, close }. */
export function slideOver(title, { wide = false } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const el = document.createElement('aside');
  el.className = 'slide' + (wide ? ' wide' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  el.innerHTML = `<header><h2>${esc(title)}</h2><button class="btn icon" data-x aria-label="বন্ধ করুন">✕</button></header><div class="body"></div><footer></footer>`;
  document.body.append(ov, el);
  const close = () => { ov.remove(); el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', close);
  $('[data-x]', el).addEventListener('click', close);
  return { el, body: $('.body', el), footer: $('footer', el), close };
}

export function setFieldError(form, field, msg) {
  $$('[aria-invalid]', form).forEach((x) => x.removeAttribute('aria-invalid'));
  $$('.err', form).forEach((x) => x.remove());
  if (!field) return;
  const input = form.querySelector(`[name="${field}"]`);
  if (!input) return;
  input.setAttribute('aria-invalid', 'true');
  input.insertAdjacentHTML('afterend', `<span class="err">${esc(msg)}</span>`);
  input.focus();
}

/* ------------- Form field rendering ------------- */
export function fieldHtml(f, v) {
  const val = v ?? f.default ?? '';
  const req = f.required ? 'required' : '';
  const hint = f.hint ? ` <small>${esc(f.hint)}</small>` : '';
  const label = `${esc(f.label)}${f.required ? ' *' : ''}${hint}`;
  switch (f.type) {
    case 'textarea': return `<label>${label}<textarea name="${f.name}" rows="${f.rows || 4}" ${req} maxlength="${f.max || 20000}">${esc(val)}</textarea></label>`;
    case 'number': return `<label>${label}<input type="number" name="${f.name}" value="${esc(val)}" ${req} ${f.min !== undefined ? `min="${f.min}"` : ''} step="1"></label>`;
    case 'bool': return `<label class="chk"><input type="checkbox" name="${f.name}" ${val === 1 || val === true || val === '1' ? 'checked' : ''}> ${esc(f.label)}</label>`;
    case 'select': {
      const opts = typeof f.options === 'function' ? f.options() : f.options;
      return `<label>${label}<select name="${f.name}" ${req}>${f.required ? '' : '<option value="">—</option>'}${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    }
    case 'datetime': return `<label>${label}<input type="datetime-local" name="${f.name}" value="${toLocalInput(val)}" ${req}></label>`;
    case 'list': {
      const arr = Array.isArray(val) ? val : (() => { try { return JSON.parse(val || '[]'); } catch { return []; } })();
      return `<label>${label} <small>(প্রতি লাইনে একটি)</small><textarea name="${f.name}" rows="${f.rows || 6}" data-list>${esc(arr.join('\n'))}</textarea></label>`;
    }
    case 'image': return `<div><label>${label}</label><div class="thumbs" data-media-field="${f.name}" data-multi="0" data-accept="${f.accept || 'image/*'}">${mediaThumbs(val ? [val] : [])}</div><input type="hidden" name="${f.name}" value="${esc(val || '')}"><div class="media-btns"><label class="btn sm">আপলোড<input type="file" accept="${f.accept || 'image/*'}" data-upload-for="${f.name}" hidden></label><button type="button" class="btn sm" data-add-url-for="${f.name}">লিংক দিন</button></div></div>`;
    case 'images': {
      const arr = Array.isArray(val) ? val : (() => { try { return JSON.parse(val || '[]'); } catch { return []; } })();
      return `<div><label>${label}</label><div class="thumbs" data-media-field="${f.name}" data-multi="1">${mediaThumbs(arr)}</div><input type="hidden" name="${f.name}" value="${esc(JSON.stringify(arr))}"><div class="media-btns"><label class="btn sm">ছবি আপলোড<input type="file" accept="image/*" multiple data-upload-for="${f.name}" hidden></label><button type="button" class="btn sm" data-add-url-for="${f.name}">ছবির লিংক যোগ করুন</button></div><small class="muted">প্রথম ছবিটি আগে দেখায়। ক্রম বদলাতে সরিয়ে আবার যোগ করুন।</small></div>`;
    }
    case 'video': return `<div class="video-field"><label>${label}<input type="text" name="${f.name}" value="${esc(val)}" maxlength="500" placeholder="https://youtu.be/… · facebook.com/…/videos/… · vimeo.com/… · drive.google.com/… · .mp4" data-video-input></label><div class="media-btns"><label class="btn sm">ভিডিও ফাইল আপলোড<input type="file" accept="video/mp4,video/webm" data-upload-to-input="${f.name}" hidden></label><span class="small muted" data-video-kind>${videoKind(val)}</span></div></div>`;
    case 'links': {
      const arr = Array.isArray(val) ? val : (() => { try { return JSON.parse(val || '[]'); } catch { return []; } })();
      return `<label>${label} <small>(প্রতি লাইনে: লেবেল | https://লিংক)</small><textarea name="${f.name}" rows="${f.rows || 3}" data-links>${esc(arr.map((l) => `${l.label} | ${l.url}`).join('\n'))}</textarea></label>`;
    }
    default: return `<label>${label}<input type="${f.inputType || 'text'}" name="${f.name}" value="${esc(val)}" ${req} maxlength="${f.max || 500}" ${f.pattern ? `pattern="${f.pattern}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}></label>`;
  }
}

/** Uploaded R2 key → /media/…; https links and site paths (/assets/…) are used as they are. */
export const mediaSrc = (k) => (/^https?:\/\//.test(k) || k.startsWith('/') ? k : `/media/${k}`);

/** Which player a pasted video link will use (mirrors shared/media.ts parseVideo). */
export function videoKind(v) {
  const s = String(v || '').trim();
  if (!s) return 'ভিডিও নেই';
  if (/youtu\.?be/.test(s)) return '✓ ইউটিউব ভিডিও';
  if (/vimeo\.com/.test(s)) return '✓ ভিমিও ভিডিও';
  if (/facebook\.com|fb\.watch/.test(s)) return '✓ ফেসবুক ভিডিও';
  if (/drive\.google\.com/.test(s)) return '✓ গুগল ড্রাইভ ভিডিও (শেয়ার: Anyone with the link)';
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(s) || !/^https?:/.test(s)) return '✓ ভিডিও ফাইল';
  return 'বাইরের লিংক — বোতাম হিসেবে দেখাবে';
}

function mediaThumbs(keys) {
  return keys.filter(Boolean).map((k) => `<figure data-key="${esc(k)}">${/\.(mp4|webm)$/.test(k) ? `<video src="${esc(mediaSrc(k))}" muted></video>` : `<img src="${esc(mediaSrc(k))}" alt="" loading="lazy">`}<button type="button" data-remove-media aria-label="সরান">✕</button></figure>`).join('');
}

/** Wire up upload inputs and removable thumbnails inside a form. */
export function bindMedia(form) {
  const sync = (name) => {
    const box = form.querySelector(`[data-media-field="${name}"]`);
    const keys = $$('figure', box).map((f) => f.dataset.key);
    form.querySelector(`input[type=hidden][name="${name}"]`).value = box.dataset.multi === '1' ? JSON.stringify(keys) : keys[0] || '';
  };
  form.addEventListener('input', (e) => {
    if (!e.target.matches('[data-video-input]')) return;
    const k = e.target.closest('.video-field')?.querySelector('[data-video-kind]');
    if (k) k.textContent = videoKind(e.target.value);
  });
  $$('[data-upload-to-input]', form).forEach((inp) => inp.addEventListener('change', async () => {
    const target = form.querySelector(`[name="${inp.dataset.uploadToInput}"]`);
    const fd = new FormData();
    fd.append('file', inp.files[0]);
    try {
      const r = await api('/uploads', { method: 'POST', body: fd });
      target.value = r.key;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      toast('আপলোড সম্পন্ন');
    } catch (err) { toast(err.message, true); }
    inp.value = '';
  }));
  form.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-url-for]');
    if (add) {
      const name = add.dataset.addUrlFor;
      const url = (window.prompt('ছবির লিংক দিন (https://… অথবা /assets/…)') || '').trim();
      if (!url) return;
      if (!/^https?:\/\/\S+$/.test(url) && !/^\/[\w./%-]+$/.test(url)) { toast('সঠিক লিংক দিন — https:// দিয়ে শুরু হবে', true); return; }
      const box = form.querySelector(`[data-media-field="${name}"]`);
      if (box.dataset.multi !== '1') box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', mediaThumbs([url]));
      sync(name);
      return;
    }
    const b = e.target.closest('[data-remove-media]');
    if (!b) return;
    const box = b.closest('[data-media-field]');
    b.closest('figure').remove();
    sync(box.dataset.mediaField);
  });
  $$('[data-upload-for]', form).forEach((inp) => inp.addEventListener('change', async () => {
    const name = inp.dataset.uploadFor;
    const box = form.querySelector(`[data-media-field="${name}"]`);
    for (const file of inp.files) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await api('/uploads', { method: 'POST', body: fd });
        if (box.dataset.multi !== '1') box.innerHTML = '';
        box.insertAdjacentHTML('beforeend', mediaThumbs([r.key]));
        sync(name);
        toast('আপলোড সম্পন্ন');
      } catch (err) { toast(err.message, true); }
    }
    inp.value = '';
  }));
}

export function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    if (f.type === 'bool') out[f.name] = el.checked ? 1 : 0;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'datetime') out[f.name] = fromLocalInput(el.value);
    else if (f.type === 'list') out[f.name] = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'images') out[f.name] = JSON.parse(el.value || '[]');
    else if (f.type === 'links') out[f.name] = el.value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p.length >= 2 && p[1]).map(([label, ...u]) => ({ label, url: u.join('|') }));
    else if (f.type === 'image') out[f.name] = el.value || null;
    else if (f.type === 'select' && f.numeric) out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = el.value;
  }
  return out;
}

/** Open a create/edit form in a slide-over. */
export function openForm({ title, fields, values = {}, onSubmit, extra, wide }) {
  const so = slideOver(title, { wide });
  const form = document.createElement('form');
  form.className = 'grid';
  form.noValidate = false;
  form.innerHTML = fields.map((f) => fieldHtml(f, values[f.name])).join('') + (extra || '');
  so.body.appendChild(form);
  so.footer.innerHTML = `<button class="btn" type="button" data-cancel>বাতিল</button><button class="btn primary" type="button" data-save>সংরক্ষণ করুন</button>`;
  bindMedia(form);
  $('[data-cancel]', so.footer).addEventListener('click', so.close);
  const save = async () => {
    setFieldError(form);
    if (!form.reportValidity()) return;
    const btn = $('[data-save]', so.footer);
    btn.disabled = true;
    try {
      await onSubmit(readForm(form, fields), form);
      toast('সংরক্ষিত হয়েছে');
      so.close();
    } catch (err) {
      setFieldError(form, err.code, err.message);
      toast(err.message, true);
    } finally { btn.disabled = false; }
  };
  $('[data-save]', so.footer).addEventListener('click', save);
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  setTimeout(() => form.querySelector('input,textarea,select')?.focus(), 50);
  return { ...so, form };
}

/* ------------- Generic resource list ------------- */
export async function listView(root, cfg) {
  const st = { page: 1, q: '', filters: { ...(cfg.defaultFilters || {}) } };
  const canWrite = !cfg.writePerm || can(cfg.writePerm);
  root.innerHTML = `
    <div class="page-head"><h1>${esc(cfg.title)}</h1><div class="actions">
      ${cfg.exportUrl && can('export') ? `<a class="btn" href="/api/admin${cfg.exportUrl}" download>সিএসভি এক্সপোর্ট</a>` : ''}
      ${(cfg.fields || cfg.onCreate) && canWrite && cfg.allowCreate !== false ? `<button class="btn primary" data-new>+ নতুন ${esc(cfg.singular || '')}</button>` : ''}
    </div></div>
    ${cfg.intro ? `<p class="muted">${cfg.intro}</p>` : ''}
    <div class="toolbar">
      ${cfg.search !== false ? '<input type="search" placeholder="খুঁজুন…" aria-label="খুঁজুন" data-q>' : ''}
      ${(cfg.filters || []).map((f) => `<select data-filter="${f.name}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: সব</option>${(typeof f.options === 'function' ? f.options() : f.options).map(([k, l]) => `<option value="${esc(k)}" ${String(st.filters[f.name] ?? '') === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`).join('')}
    </div>
    <div class="table-wrap"><table><thead><tr>${cfg.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead><tbody data-rows><tr><td class="empty" colspan="${cfg.columns.length + 1}">লোড হচ্ছে…</td></tr></tbody></table></div>
    <div class="pager"><span class="muted small" data-count></span><div><button class="btn sm" data-prev>← আগের</button> <button class="btn sm" data-next>পরের →</button></div></div>`;

  const load = async () => {
    const qs = new URLSearchParams({ page: st.page, per: cfg.perPage || 25, ...(st.q ? { q: st.q } : {}) });
    Object.entries(st.filters).forEach(([k, v]) => v !== '' && v !== undefined && qs.set(k, v));
    try {
      const r = await api(`${cfg.endpoint}?${qs}`);
      const tbody = $('[data-rows]', root);
      tbody.innerHTML = r.items.length ? r.items.map((row) => `<tr data-id="${row.id}">${cfg.columns.map((c) => `<td>${c.render ? c.render(row) : esc(row[c.key])}</td>`).join('')}
        <td><div class="row-actions">${(cfg.rowActions || []).map((a) => (!a.perm || can(a.perm)) && (!a.show || a.show(row)) ? `<button class="btn sm" data-act="${a.key}">${esc(a.label)}</button>` : '').join('')}
        ${cfg.onOpen ? '<button class="btn sm" data-open>খুলুন</button>' : ''}
        ${cfg.fields && canWrite && !cfg.onOpen ? '<button class="btn sm" data-edit>সম্পাদনা</button>' : ''}
        ${canWrite && cfg.allowDelete !== false && (!cfg.deletePerm || can(cfg.deletePerm)) ? '<button class="btn sm danger" data-del>মুছুন</button>' : ''}</div></td></tr>`).join('')
        : `<tr><td class="empty" colspan="${cfg.columns.length + 1}">কিছু পাওয়া যায়নি</td></tr>`;
      $('[data-count]', root).textContent = `মোট ${bn(r.total)}টি · পৃষ্ঠা ${bn(r.page)}`;
      $('[data-prev]', root).disabled = r.page <= 1;
      $('[data-next]', root).disabled = r.page * r.perPage >= r.total;
      st.items = r.items;
    } catch (err) { toast(err.message, true); }
  };

  const edit = (row) => openForm({
    title: row ? `${cfg.singular || ''} সম্পাদনা` : `নতুন ${cfg.singular || ''}`,
    fields: typeof cfg.fields === 'function' ? cfg.fields(row) : cfg.fields,
    values: row ? (cfg.toForm ? cfg.toForm(row) : row) : cfg.newValues || {},
    wide: cfg.wideForm,
    onSubmit: async (data) => {
      const payload = cfg.toApi ? cfg.toApi(data, row) : data;
      if (row) await api(`${cfg.endpoint}/${row.id}`, { method: 'PUT', body: payload });
      else await api(cfg.endpoint, { method: 'POST', body: payload });
      load();
    },
  });

  let t;
  $('[data-q]', root)?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); st.page = 1; load(); }, 300); });
  $$('[data-filter]', root).forEach((s) => s.addEventListener('change', () => { st.filters[s.dataset.filter] = s.value; st.page = 1; load(); }));
  $('[data-prev]', root).addEventListener('click', () => { st.page--; load(); });
  $('[data-next]', root).addEventListener('click', () => { st.page++; load(); });
  $('[data-new]', root)?.addEventListener('click', () => (cfg.onCreate ? cfg.onCreate(load) : edit(null)));
  $('[data-rows]', root).addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const row = st.items.find((r) => String(r.id) === tr.dataset.id);
    if (e.target.closest('[data-edit]')) edit(row);
    else if (e.target.closest('[data-open]')) cfg.onOpen(row, load);
    else if (e.target.closest('[data-del]')) {
      if (await confirmDialog(`“${row[cfg.titleKey || 'name'] || row.title || row.code || row.id}” মুছে ফেলবেন? এটি ফেরত আনা যাবে না।`)) {
        try { await api(`${cfg.endpoint}/${row.id}`, { method: 'DELETE' }); toast('মুছে ফেলা হয়েছে'); load(); } catch (err) { toast(err.message, true); }
      }
    } else {
      const a = e.target.closest('[data-act]');
      if (a) { const act = cfg.rowActions.find((x) => x.key === a.dataset.act); try { await act.run(row, load); } catch (err) { toast(err.message, true); } }
    }
  });
  await load();
  return { reload: load };
}

export const statusPill = (label, kind = '') => `<span class="pill ${kind}">${esc(label)}</span>`;
export const yesNo = (v) => (v ? statusPill('সক্রিয়', 'ok') : statusPill('নিষ্ক্রিয়', 'bad'));
