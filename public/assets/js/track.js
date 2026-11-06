/*
 * Tracking bootstrap: Meta Pixel, GA4, GTM, Microsoft Clarity.
 * - Config comes from the server; outside production all IDs are empty, so nothing loads.
 * - Server-mirrored events (PageView, ViewContent, Lead, InitiateCheckout, Purchase) carry the same event_id
 *   the Worker sends through the Conversions API, so Meta de-duplicates them.
 * - Purchase only fires when the server rendered a confirmed, live-mode payment into the page config.
 * - The owner's own browser (?sb_internal=1) and automated browsers (screenshots, tests) never load any tag,
 *   so they never pollute ad data. ?sb_internal=0 switches it back on.
 */
(function () {
  var el = document.getElementById('track-config');
  var cfg = {};
  try { cfg = JSON.parse(el ? el.textContent : '{}') || {}; } catch (e) {}
  var w = window;
  var apiMeta = document.querySelector('meta[name="sb-api-base"]');
  var API = apiMeta ? apiMeta.content.replace(/\/$/, '') : '';

  function cookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function rid(prefix) { var a = new Uint8Array(12); crypto.getRandomValues(a); return prefix + '_' + Array.from(a, function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }

  // ---- Internal / automated traffic: no tags at all ----
  var internal = false;
  try {
    var q = new URLSearchParams(location.search).get('sb_internal');
    if (q === '1') localStorage.setItem('sb_internal', '1');
    if (q === '0') localStorage.removeItem('sb_internal');
    internal = localStorage.getItem('sb_internal') === '1';
  } catch (e) {}
  var automated = navigator.webdriver === true || /HeadlessChrome|bot\/|crawler|spider|\+https?:\/\/|Lighthouse|PageSpeed/i.test(navigator.userAgent);
  w.SB_NO_TRACK = internal || automated;
  var noop = function () {};
  if (w.SB_NO_TRACK) {
    w.SBTrack = { fire: noop, standard: noop, custom: noop, step: noop };
    w.SB_LANDING_ID = cfg.landingPageId || null;
    if (internal) document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('a');
      b.className = 'internal-badge'; b.href = '?sb_internal=0';
      b.textContent = 'অভ্যন্তরীণ ভিজিট — ট্র্যাকিং বন্ধ (চালু করতে চাপুন)';
      document.body.appendChild(b);
    });
    return;
  }

  // Meta Pixel
  if (cfg.pixelId) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(w, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    w.fbq('init', cfg.pixelId);
  }
  w.dataLayer = w.dataLayer || [];
  // GA4 directly (skipped when GA4 runs inside the GTM container — otherwise every page view counts twice)
  if (cfg.ga4 && !cfg.ga4ViaGtm) {
    var g = document.createElement('script'); g.async = true; g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4); document.head.appendChild(g);
    w.gtag = function () { w.dataLayer.push(arguments); };
    w.gtag('js', new Date());
    // Same visitor/session across the storefront (GitHub Pages) and the Worker (payment + order pages).
    w.gtag('config', cfg.ga4, cfg.linkDomains && cfg.linkDomains.length > 1 ? { linker: { domains: cfg.linkDomains } } : {});
  }
  // GTM
  if (cfg.gtm) {
    w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var t = document.createElement('script'); t.async = true; t.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(cfg.gtm); document.head.appendChild(t);
  }
  // Microsoft Clarity
  if (cfg.clarity) {
    (function (c, l, a, r, i, t, y) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); }; t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i; y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y); })(w, document, 'clarity', 'script', cfg.clarity);
  }

  function beacon(event, eventId, customData) {
    if (!cfg.pixelId) return;
    var body = JSON.stringify({ event: event, eventId: eventId, url: location.href, customData: customData || {}, fbp: cookie('_fbp'), fbc: cookie('_fbc') });
    try { fetch(API + '/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true }); } catch (e) {}
  }

  /** GA4 ecommerce items from Meta-style custom data. */
  function items(d) {
    d = d || {};
    var ids = d.content_ids || [];
    return ids.map(function (id) { return { item_id: String(id), item_name: d.content_name || undefined, item_category: d.content_category || d.item_category || undefined, price: ids.length === 1 ? d.value : undefined, quantity: 1 }; });
  }
  var GA_MAP = { Lead: 'generate_lead', InitiateCheckout: 'begin_checkout', Purchase: 'purchase', ViewContent: 'view_item', AddToCart: 'add_to_cart', Contact: 'contact' };
  function ga(name, d, extra) {
    var ev = GA_MAP[name];
    if (!ev) return;
    var params = { currency: 'BDT', value: d && d.value, items: items(d) };
    for (var k in extra || {}) params[k] = extra[k];
    if (w.gtag) w.gtag('event', ev, params);
    // GTM: GA4-standard ecommerce object (clear the previous one first, as Google recommends).
    w.dataLayer.push({ ecommerce: null });
    w.dataLayer.push({ event: ev, ecommerce: params, event_id: extra && extra.event_id });
  }

  w.SBTrack = {
    /** Standard event whose server-side twin has ALREADY been sent with the same eventId. */
    fire: function (name, data, eventId) {
      if (!eventId) return;
      if (name === 'Purchase') return; // Purchase is only ever fired from the server-confirmed page config below.
      if (w.fbq) w.fbq('track', name, data || {}, { eventID: eventId });
      ga(name, data, { event_id: eventId });
    },
    /** Browser-only standard funnel step (AddToCart, Contact) — no money involved, no server twin. */
    standard: function (name, data) {
      if (name !== 'AddToCart' && name !== 'Contact') return;
      if (w.fbq) w.fbq('track', name, data || {});
      ga(name, data);
    },
    /** Custom engagement signals for ad audiences (DemoClick, VideoPlay, PortfolioClick) — never optimise for these as purchases. */
    custom: function (name, data) {
      if (!/^(DemoClick|VideoPlay|PortfolioClick)$/.test(name)) return;
      if (w.fbq) w.fbq('trackCustom', name, data || {});
      var snake = name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
      if (w.gtag) w.gtag('event', snake, { content_id: data && data.content_ids && data.content_ids[0], content_name: data && data.content_name });
      w.dataLayer.push({ event: snake, content_id: data && data.content_ids && data.content_ids[0], content_name: data && data.content_name });
    },
  };

  /** Lead box progress: each answered question → Pixel custom event + CAPI mirror (same id) + GA4 + GTM. Never a conversion. */
  w.SBTrack.step = function (step, answer) {
    var id = rid('lb');
    var data = { step: String(step).slice(0, 30), answer: String(answer || '').slice(0, 80) };
    if (w.fbq) w.fbq('trackCustom', 'LeadBoxStep', data, { eventID: id });
    if (w.gtag) w.gtag('event', 'lead_box_step', data);
    w.dataLayer.push({ event: 'lead_box_step', lead_box_step: data.step, lead_box_answer: data.answer, event_id: id });
    beacon('LeadBoxStep', id, data);
  };

  // PageView (+ CAPI mirror with the same id)
  var pv = rid('pv');
  if (w.fbq) w.fbq('track', 'PageView', {}, { eventID: pv });
  beacon('PageView', pv);

  if (cfg.pageEvent) {
    // Always a fresh id per page view: a static copy of the page must not reuse one baked-in id.
    cfg.pageEvent.eventId = rid('vc');
    if (w.fbq) w.fbq('track', cfg.pageEvent.name, cfg.pageEvent.customData || {}, { eventID: cfg.pageEvent.eventId });
    ga('ViewContent', cfg.pageEvent.customData, { event_id: cfg.pageEvent.eventId });
    beacon(cfg.pageEvent.name, cfg.pageEvent.eventId, cfg.pageEvent.customData);
  }

  // Purchase — present only when payment_status = paid AND PAYMENT_MODE = live (rendered by the Worker).
  if (cfg.purchase && cfg.purchase.eventId) {
    var key = 'sb_purchase_' + cfg.purchase.eventId;
    var already = false;
    try { already = !!localStorage.getItem(key); localStorage.setItem(key, '1'); } catch (e) {}
    if (!already) {
      if (w.fbq) w.fbq('track', 'Purchase', { value: cfg.purchase.value, currency: 'BDT', content_ids: cfg.purchase.contentIds, content_type: 'product' }, { eventID: cfg.purchase.eventId });
      ga('Purchase', { value: cfg.purchase.value, content_ids: cfg.purchase.contentIds }, { transaction_id: cfg.purchase.orderNumber, event_id: cfg.purchase.eventId });
    }
  }
  w.SB_LANDING_ID = cfg.landingPageId || null;
})();
