#!/usr/bin/env node
/**
 * Checks the Google service account (GOOGLE_SERVICES_JSON) the way the Worker uses it:
 *   1. the secret parses and has a private key,
 *   2. Google gives a token for it,
 *   3. Google Drive: which files are shared with it, and whether one test file can be streamed (first 1 KB),
 *   4. Gemini through Vertex AI answers.
 * This repository is public, so its Actions logs are too: the output never contains the key, a token,
 * file names or links — only yes/no, file types and sizes. The test file is matched by the SHA-256 of its id.
 *
 * Env: GOOGLE_SERVICES_JSON (required), DRIVE_FILE_ID or DRIVE_FILE_SHA256 (optional), GITHUB_STEP_SUMMARY (optional).
 */
import { createHash, createSign } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const lines = [];
const say = (ok, text) => { const l = `${ok === null ? 'ℹ️' : ok ? '✅' : '❌'} ${text}`; lines.push(l); console.log(l); };
const finish = (code) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Google service account check\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`);
  process.exit(code);
};
const b64url = (b) => Buffer.from(b).toString('base64url');
const reason = async (res) => {
  const j = await res.json().catch(() => null);
  const e = j?.error;
  const msg = typeof e === 'string' ? `${e} ${j?.error_description || ''}` : e?.message || e?.status || '';
  return `HTTP ${res.status}${msg ? ` — ${String(msg).replace(/\s+/g, ' ').slice(0, 200)}` : ''}`;
};

const raw = (process.env.GOOGLE_SERVICES_JSON || '').trim();
if (!raw) { say(false, 'GOOGLE_SERVICES_JSON secret is not set in this repository (Settings → Secrets and variables → Actions).'); finish(1); }
let sa;
try { sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); } catch { say(false, 'GOOGLE_SERVICES_JSON is not valid JSON (paste the whole key file Google gave you).'); finish(1); }
if (!sa.client_email || !sa.private_key) { say(false, 'The JSON has no client_email / private_key — it must be a service-account key (type "service_account").'); finish(1); }
say(true, `Service-account key found (…@${sa.client_email.split('@')[1]}, project ${sa.project_id ? 'set' : 'missing'}).`);

async function token(scope) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key.replace(/\\n/g, '\n'));
  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error(await reason(res));
  return (await res.json()).access_token;
}

let failed = false;
let drive;
try {
  drive = await token('https://www.googleapis.com/auth/drive.readonly');
  say(true, 'Google issued a token (the key is valid and active).');
} catch (e) {
  say(false, `Google refused the key: ${e.message}`);
  finish(1);
}

/* Drive */
const H = { authorization: `Bearer ${drive}` };
const list = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=200&q=trashed%3Dfalse&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,mimeType,size)', { headers: H });
if (!list.ok) {
  failed = true;
  const why = await reason(list);
  say(false, /has not been used|disabled|accessNotConfigured/i.test(why) ? `Google Drive API is not enabled for this project — enable it in Google Cloud Console (APIs & Services → Library → Google Drive API). ${why}` : `Drive did not answer: ${why}`);
} else {
  const page = await list.json();
  const files = page.files || [];
  const videos = files.filter((f) => f.mimeType.startsWith('video/')).length;
  const more = page.nextPageToken ? '+' : '';
  say(files.length > 0, `Drive: ${files.length}${more} file(s) are shared with the service account (${videos}${more} video in the first ${files.length}).${files.length ? '' : ' Share each course video with the service-account email as Viewer.'}`);
  const wantId = process.env.DRIVE_FILE_ID || '';
  const wantHash = (process.env.DRIVE_FILE_SHA256 || '').toLowerCase();
  const target = wantId ? { id: wantId } : wantHash ? files.find((f) => createHash('sha256').update(f.id).digest('hex') === wantHash) : null;
  if (wantId || wantHash) {
    if (!target) { failed = true; say(false, 'The test file is NOT shared with the service account — open it in Drive → Share → add the service-account email (Viewer).'); }
    else {
      const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${target.id}?fields=mimeType,size&supportsAllDrives=true`, { headers: H });
      if (!meta.ok) { failed = true; say(false, `Test file metadata: ${await reason(meta)}`); }
      else {
        const m = await meta.json();
        const part = await fetch(`https://www.googleapis.com/drive/v3/files/${target.id}?alt=media&supportsAllDrives=true`, { headers: { ...H, range: 'bytes=0-1023' } });
        const bytes = part.ok ? (await part.arrayBuffer()).byteLength : 0;
        const ok = part.status === 206 || part.status === 200;
        if (!ok) failed = true;
        say(ok, ok ? `Test file streams: ${m.mimeType}, ${m.size ? (Number(m.size) / 1048576).toFixed(1) + ' MB' : 'size n/a'} — partial download ${part.status} (${bytes} bytes), so seeking works.` : `Test file could not be streamed: ${await reason(part)}`);
      }
    }
  }
}

/* Gemini through Vertex AI */
if (!sa.project_id) say(null, 'Vertex AI: skipped (no project_id in the key).');
else {
  try {
    const cloud = await token('https://www.googleapis.com/auth/cloud-platform');
    const res = await fetch(`https://aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cloud}`, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK' }] }], generationConfig: { maxOutputTokens: 20, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    if (res.ok) {
      const j = await res.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
      say(true, `Gemini via Vertex AI works (answered "${text.slice(0, 20)}").`);
    } else {
      const why = await reason(res);
      say(null, /has not been used|disabled|SERVICE_DISABLED|billing/i.test(why) ? `Gemini via Vertex AI is not available: enable the Vertex AI API (with billing) in the Google Cloud project to use it. ${why}` : /PERMISSION_DENIED|403/.test(why) ? `Gemini via Vertex AI: the service account needs the "Vertex AI User" role. ${why}` : `Gemini via Vertex AI did not answer: ${why}`);
    }
  } catch (e) {
    say(null, `Vertex AI token: ${e.message}`);
  }
}
finish(failed ? 1 : 0);
