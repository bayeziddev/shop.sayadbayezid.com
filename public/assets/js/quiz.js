import { $, api, taka, esc, attribution, formJson, setMsg, showFieldError } from './lib.js';

const root = $('[data-quiz]');
const pkgs = JSON.parse($('#quiz-packages').textContent);
const Q = [
  { key: 'type', q: 'আপনার ব্যবসা কোন ধরনের?', opts: [['fashion', 'ফ্যাশন / বুটিক'], ['clothing', 'পোশাক'], ['gadgets', 'গ্যাজেট / ইলেকট্রনিক্স'], ['herbal', 'হারবাল / প্রাকৃতিক পণ্য'], ['news', 'সংবাদ প্রকাশ'], ['blog', 'ব্লগ / কনটেন্ট']] },
  { key: 'size', q: 'কতগুলো পণ্য বা পোস্ট থাকবে?', opts: [['small', '১০০ এর কম'], ['large', '১০০ এর বেশি / নিয়মিত বাড়বে']] },
  { key: 'ads', q: 'আপনি কি নিয়মিত ফেসবুকে বিজ্ঞাপন চালান?', opts: [['yes', 'হ্যাঁ, নিয়মিত'], ['no', 'এখনো না / মাঝে মাঝে']] },
  { key: 'budget', q: 'আপনার আনুমানিক বাজেট?', opts: [['low', '১৫,০০০ টাকার মধ্যে'], ['high', '১৫,০০০ টাকার বেশি']] },
];
const answers = {};
let step = 0;

function recommend() {
  const premium = answers.size === 'large' || (answers.ads === 'yes' && answers.budget === 'high');
  const inCat = pkgs.filter((p) => p.categorySlug === answers.type);
  return inCat.find((p) => p.tier === (premium ? 'premium' : 'basic')) || inCat[0] || pkgs[0];
}

function render() {
  if (step < Q.length) {
    const q = Q[step];
    root.innerHTML = `<div class="progress"><span style="width:${(step / Q.length) * 100}%"></span></div><h2>${esc(q.q)}</h2>
      <div class="quiz-options">${q.opts.map(([v, l]) => `<button class="quiz-opt" data-v="${v}">${esc(l)}</button>`).join('')}</div>
      ${step ? '<button class="link-btn" data-back>← আগের প্রশ্ন</button>' : ''}`;
    root.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { answers[q.key] = b.dataset.v; step++; render(); }));
    root.querySelector('[data-back]')?.addEventListener('click', () => { step--; render(); });
    return;
  }
  const p = recommend();
  root.innerHTML = `<div class="progress"><span style="width:100%"></span></div>
    ${p ? `<h2>আপনার জন্য উপযুক্ত: ${esc(p.name)}</h2><p class="muted">শুরু ${taka(p.basePrice)} থেকে। প্যাকেজ পেজে অ্যাড-অন বেছে নিয়ে চূড়ান্ত দাম দেখুন।</p>
      <div class="pkg-actions"><a class="btn btn-primary" href="/package/${esc(p.slug)}">প্যাকেজটি দেখুন</a><button class="btn btn-ghost" data-restart>আবার শুরু করুন</button></div>` : '<h2>আপনার চাহিদা জানান</h2>'}
    <form class="form" data-quiz-lead><h3>পরামর্শের জন্য কল চান?</h3><div class="grid-2"><label>নাম<input name="name" required maxlength="100"></label><label>মোবাইল নম্বর<input name="phone" required inputmode="tel" maxlength="20"></label></div>
      <button class="btn btn-ghost">কল ব্যাক চাই</button><p class="form-msg" data-form-msg role="status"></p></form>`;
  root.querySelector('[data-restart]')?.addEventListener('click', () => { step = 0; render(); });
  const f = root.querySelector('[data-quiz-lead]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = f.querySelector('[data-form-msg]');
    try {
      const r = await api('/api/leads', { method: 'POST', body: { ...formJson(f), source: 'quiz', packageId: p?.id, quiz: answers, attribution: attribution() } });
      window.SBTrack?.fire('Lead', { content_name: 'quiz' }, r.eventId);
      f.reset(); setMsg(msg, 'ধন্যবাদ! শীঘ্রই আপনাকে কল করা হবে।', true);
    } catch (err) { showFieldError(f, err.code, err.message); setMsg(msg, err.message); }
  });
}
render();
