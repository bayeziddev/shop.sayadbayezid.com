import { clampStr, toInt } from './util';

export interface Attribution {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  fbclid: string;
  fbp: string;
  fbc: string;
  landing_page_id: number | null;
  referral_code: string;
  source_url: string;
}

/** Sanitise attribution sent by the browser (captured from URL params on first/last touch). */
export function readAttribution(raw: unknown, cookieHeader = ''): Attribution {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cookie = (name: string) => {
    const m = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : '';
  };
  const fbclid = clampStr(a.fbclid, 500);
  let fbc = clampStr(a.fbc, 600) || cookie('_fbc');
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  return {
    utm_source: clampStr(a.utm_source, 100),
    utm_medium: clampStr(a.utm_medium, 100),
    utm_campaign: clampStr(a.utm_campaign, 200),
    utm_content: clampStr(a.utm_content, 200),
    utm_term: clampStr(a.utm_term, 200),
    fbclid,
    fbp: clampStr(a.fbp, 200) || cookie('_fbp'),
    fbc,
    landing_page_id: toInt(a.landing_page_id, 0) || null,
    referral_code: clampStr(a.ref, 40).toUpperCase(),
    source_url: clampStr(a.source_url, 1000),
  };
}
