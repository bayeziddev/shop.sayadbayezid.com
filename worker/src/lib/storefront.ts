import type { Env } from '../env';
import { nowIso } from './util';

/**
 * The public storefront on GitHub Pages is a static copy of this Worker's pages. GitHub runs its scheduled
 * re-export only every few hours in practice, so an admin's new price or offer could stay invisible for a long
 * time. With PAGES_REFRESH_TOKEN set, every admin change to public content starts the export at once
 * (the workflow cancels an older run still in progress, so the newest data always wins).
 */
export interface RefreshState { at: string; ok: boolean; status: number; reason: string; detail?: string }

const KEY = 'storefront:refresh:last';

export function refreshConfigured(env: Env): { pages: boolean; token: boolean; repo: string } {
  return { pages: !!env.PUBLIC_SITE_URL, token: !!env.PAGES_REFRESH_TOKEN, repo: env.GITHUB_REPO || '' };
}

export async function lastRefresh(env: Env): Promise<RefreshState | null> {
  return (await env.KV.get(KEY, 'json').catch(() => null)) as RefreshState | null;
}

/** Start the "Publish storefront to GitHub Pages" workflow. Never throws. */
export async function refreshStorefront(env: Env, reason: string): Promise<RefreshState> {
  const cfg = refreshConfigured(env);
  if (!cfg.pages) return { at: nowIso(), ok: false, status: 0, reason, detail: 'no_pages_copy' };
  if (!cfg.token || !cfg.repo) return { at: nowIso(), ok: false, status: 0, reason, detail: 'no_token' };
  let state: RefreshState;
  try {
    const res = await fetch(`https://api.github.com/repos/${cfg.repo}/actions/workflows/pages.yml/dispatches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.PAGES_REFRESH_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'cwb-agency-worker',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    const detail = res.ok ? '' : ((await res.json().catch(() => null)) as { message?: string } | null)?.message?.slice(0, 160) || '';
    state = { at: nowIso(), ok: res.status === 204, status: res.status, reason, detail };
  } catch (e) {
    state = { at: nowIso(), ok: false, status: 0, reason, detail: String((e as Error).message).slice(0, 160) };
  }
  await env.KV.put(KEY, JSON.stringify(state)).catch(() => {});
  return state;
}

/** Admin API paths whose changes show on the public site. */
export const PUBLIC_CONTENT = /^\/api\/admin\/(categories|packages|addons|offers|coupons|banners|faqs|reviews|landing-pages|portfolio|designs|settings|chat-settings|course-categories|courses|course-sections|course-lessons)(\/|$)/;
