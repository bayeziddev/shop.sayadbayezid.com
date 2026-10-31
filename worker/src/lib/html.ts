/** Tiny auto-escaping HTML template helper for server-rendered pages. */
export class Raw {
  constructor(public readonly value: string) {}
  toString() {
    return this.value;
  }
}

export const raw = (s: string) => new Raw(s);

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type Val = unknown;

function render(v: Val): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings: TemplateStringsArray, ...values: Val[]): Raw {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return new Raw(out);
}

/** JSON safe to embed inside <script type="application/json">. */
export function jsonScript(id: string, data: unknown): Raw {
  const s = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return raw(`<script type="application/json" id="${esc(id)}">${s}</script>`);
}

/** Plain text (admin-edited) → paragraphs. */
export function paragraphs(text: string): Raw {
  return raw(
    String(text || '')
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
      .join(''),
  );
}

export function safeUrl(u: string | null | undefined): string {
  const s = String(u || '').trim();
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s;
  return '';
}
