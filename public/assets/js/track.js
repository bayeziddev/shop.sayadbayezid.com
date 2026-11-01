/*
 * Tracking bootstrap: Meta Pixel, GA4, GTM, Microsoft Clarity.
 * - Never blocked behind a consent gate (privacy notice in footer / privacy page).
 * - Config comes from the server; outside production all IDs are empty, so nothing loads.
 * - Every browser event carries the same event_id the Worker sends via the Conversions API.
 * - Purchase only fires when the server rendered a confirmed, live-mode payment into the page config.
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

  // Meta Pixel
  if (cfg.pixelId) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(w, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    w.fbq('init', cfg.pixelId);
  }
  // GA4
  if (cfg.ga4) {
    var g = document.createElement('script'); g.async = true; g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4); document.head.appendChild(g);
    w.dataLayer = w.dataLayer || []; w.gtag = function () { w.dataLayer.push(arguments); };
    w.gtag('js', new Date()); w.gtag('config', cfg.ga4);
  }
  // GTM (if you also run GA4 inside GTM, clear one of the two IDs in admin to avoid double counting)
  if (cfg.gtm) {
    w.dataLayer = w.dataLayer || []; w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
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

  var GA_MAP = { Lead: 'generate_lead', InitiateCheckout: 'begin_checkout', Purchase: 'purchase', ViewContent: 'view_item' };

  /** Fire a browser event whose server-side twin has ALREADY been sent with the same eventId. */
  w.SBTrack = {
    fire: function (name, data, eventId) {
      if (!eventId) return;
      if (name === 'Purchase') return; // Purchase is only ever fired from the server-confirmed page config below.
      if (w.fbq) w.fbq('track', name, data || {}, { eventID: eventId });
      if (w.gtag && GA_MAP[name]) w.gtag('event', GA_MAP[name], { currency: 'BDT', value: (data && data.value) || undefined });
      if (w.dataLayer) w.dataLayer.push({ event: 'sb_' + name, event_id: eventId });
    },
  };

  // PageView (+ CAPI mirror with the same id)
  var pv = rid('pv');
  if (w.fbq) w.fbq('track', 'PageView', {}, { eventID: pv });
  beacon('PageView', pv);

  if (cfg.pageEvent) {
    // Always a fresh id per page view: a static copy of the page must not reuse one baked-in id.
    cfg.pageEvent.eventId = rid('vc');
    if (w.fbq) w.fbq('track', cfg.pageEvent.name, cfg.pageEvent.customData || {}, { eventID: cfg.pageEvent.eventId });
    if (w.gtag) w.gtag('event', 'view_item', { currency: 'BDT', value: cfg.pageEvent.customData && cfg.pageEvent.customData.value });
    beacon(cfg.pageEvent.name, cfg.pageEvent.eventId, cfg.pageEvent.customData);
  }

  // Purchase — present only when payment_status = paid AND PAYMENT_MODE = live (rendered by the Worker).
  if (cfg.purchase && cfg.purchase.eventId) {
    var key = 'sb_purchase_' + cfg.purchase.eventId;
    var already = false;
    try { already = !!localStorage.getItem(key); localStorage.setItem(key, '1'); } catch (e) {}
    if (!already) {
      if (w.fbq) w.fbq('track', 'Purchase', { value: cfg.purchase.value, currency: 'BDT', content_ids: cfg.purchase.contentIds, content_type: 'product' }, { eventID: cfg.purchase.eventId });
      if (w.gtag) w.gtag('event', 'purchase', { transaction_id: cfg.purchase.orderNumber, value: cfg.purchase.value, currency: 'BDT' });
    }
  }
  w.SB_LANDING_ID = cfg.landingPageId || null;
})();
