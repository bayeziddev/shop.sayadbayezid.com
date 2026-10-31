import type { Context, Hono } from 'hono';
import type { AppBindings } from '../../env';
import { fail, ok, readJson } from '../../lib/http';
import { assertPerm } from '../../lib/auth';
import type { Permission } from '../../lib/rbac';
import { audit } from '../../lib/audit';
import { clientIp, toInt, nowIso } from '../../lib/util';

export type FieldType = 'text' | 'int' | 'bool' | 'json' | 'datetime' | 'enum';

export interface FieldDef {
  name: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  min?: number;
  values?: readonly string[];
  default?: unknown;
  pattern?: RegExp;
  label: string; // Bangla, used in validation messages
}

export interface ResourceDef {
  table: string;
  entity: string;
  fields: FieldDef[];
  writePerm: Permission;
  deletePerm?: Permission;
  searchCols?: string[];
  filterCols?: string[];
  orderBy?: string;
  hasUpdatedAt?: boolean;
  hidden?: string[]; // never returned
  beforeSave?: (c: Context<AppBindings>, data: Record<string, unknown>, existing: Record<string, unknown> | null) => Promise<void> | void;
  afterSave?: (c: Context<AppBindings>, id: number, data: Record<string, unknown>, existing: Record<string, unknown> | null) => Promise<void> | void;
  beforeDelete?: (c: Context<AppBindings>, existing: Record<string, unknown>) => Promise<void> | void;
}

export function coerce(def: ResourceDef, input: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    let v = input[f.name];
    if (v === undefined) {
      if (partial) continue;
      v = f.default;
    }
    if (v === '' && f.type !== 'text') v = null;
    if (v === null || v === undefined) {
      if (f.required) fail(422, `“${f.label}” আবশ্যক`, f.name);
      out[f.name] = f.type === 'bool' ? 0 : f.type === 'text' ? '' : null;
      continue;
    }
    switch (f.type) {
      case 'text': {
        const s = String(v).trim();
        if (f.required && !s) fail(422, `“${f.label}” আবশ্যক`, f.name);
        if (f.max && s.length > f.max) fail(422, `“${f.label}” সর্বোচ্চ ${f.max} অক্ষরের হতে পারে`, f.name);
        if (f.pattern && s && !f.pattern.test(s)) fail(422, `“${f.label}” এর বিন্যাস সঠিক নয়`, f.name);
        out[f.name] = s;
        break;
      }
      case 'int': {
        const n = Number(v);
        if (!Number.isFinite(n)) fail(422, `“${f.label}” একটি সংখ্যা হতে হবে`, f.name);
        if (f.min !== undefined && n < f.min) fail(422, `“${f.label}” কমপক্ষে ${f.min} হতে হবে`, f.name);
        out[f.name] = Math.trunc(n);
        break;
      }
      case 'bool':
        out[f.name] = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
        break;
      case 'json':
        try {
          out[f.name] = typeof v === 'string' ? JSON.stringify(JSON.parse(v)) : JSON.stringify(v);
        } catch {
          fail(422, `“${f.label}” সঠিক নয়`, f.name);
        }
        if (f.max && String(out[f.name]).length > f.max) fail(422, `“${f.label}” খুব বড়`, f.name);
        break;
      case 'datetime': {
        const t = Date.parse(String(v));
        if (!Number.isFinite(t)) fail(422, `“${f.label}” তারিখ সঠিক নয়`, f.name);
        out[f.name] = new Date(t).toISOString();
        break;
      }
      case 'enum':
        if (!f.values!.includes(String(v))) fail(422, `“${f.label}” সঠিক নয়`, f.name);
        out[f.name] = String(v);
        break;
    }
  }
  return out;
}

export function strip(def: ResourceDef, row: Record<string, unknown> | null) {
  if (!row) return row;
  for (const h of def.hidden || []) delete row[h];
  return row;
}

export function dbError(e: unknown): never {
  const m = String((e as Error)?.message || e);
  if (m.includes('UNIQUE')) fail(409, 'এই মানটি আগে থেকেই ব্যবহৃত হচ্ছে (যেমন স্লাগ বা কোড) — অন্য একটি দিন', 'unique');
  if (m.includes('FOREIGN KEY')) fail(409, 'এটির সাথে অন্য তথ্য যুক্ত আছে — আগে সেগুলো সরান বা নিষ্ক্রিয় করুন', 'fk');
  if (m.includes('CHECK')) fail(422, 'একটি মান অনুমোদিত সীমার বাইরে', 'check');
  throw e;
}

export interface ListResult { items: Record<string, unknown>[]; total: number; page: number; perPage: number }

export async function listRows(c: Context<AppBindings>, def: ResourceDef, extraWhere: string[] = [], extraBinds: unknown[] = []): Promise<ListResult> {
  const page = Math.max(1, toInt(c.req.query('page'), 1));
  const perPage = Math.min(200, Math.max(1, toInt(c.req.query('per'), 25)));
  const where = [...extraWhere];
  const binds = [...extraBinds];
  const q = (c.req.query('q') || '').trim();
  if (q && def.searchCols?.length) {
    where.push(`(${def.searchCols.map((col) => `${col} LIKE ?`).join(' OR ')})`);
    def.searchCols.forEach(() => binds.push(`%${q}%`));
  }
  for (const col of def.filterCols || []) {
    const v = c.req.query(col);
    if (v !== undefined && v !== '') {
      where.push(`${col} = ?`);
      binds.push(v);
    }
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [cnt, rows] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${def.table} ${w}`).bind(...binds),
    c.env.DB.prepare(`SELECT * FROM ${def.table} ${w} ORDER BY ${def.orderBy || 'id DESC'} LIMIT ? OFFSET ?`).bind(...binds, perPage, (page - 1) * perPage),
  ]);
  return {
    items: (rows.results as Record<string, unknown>[]).map((r) => strip(def, r)!),
    total: (cnt.results[0] as { n: number }).n,
    page,
    perPage,
  };
}

export function registerCrud(app: Hono<AppBindings>, path: string, def: ResourceDef) {
  app.get(path, async (c) => ok(c, await listRows(c, def)));

  app.get(`${path}/:id`, async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).bind(toInt(c.req.param('id'))).first();
    if (!row) fail(404, 'পাওয়া যায়নি');
    return ok(c, strip(def, row as Record<string, unknown>));
  });

  app.post(path, async (c) => {
    assertPerm(c, def.writePerm);
    const data = coerce(def, await readJson(c), false);
    await def.beforeSave?.(c, data, null);
    const cols = Object.keys(data);
    let id: number;
    try {
      const r = await c.env.DB.prepare(`INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`).bind(...cols.map((k) => data[k])).first<{ id: number }>();
      id = r!.id;
    } catch (e) {
      dbError(e);
    }
    await def.afterSave?.(c, id, data, null);
    await audit(c.env, c.get('admin').id, 'create', def.entity, id, data, clientIp(c.req.raw));
    const row = await c.env.DB.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).bind(id).first();
    return ok(c, strip(def, row as Record<string, unknown>), 201);
  });

  app.put(`${path}/:id`, async (c) => {
    assertPerm(c, def.writePerm);
    const id = toInt(c.req.param('id'));
    const existing = await c.env.DB.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    if (!existing) fail(404, 'পাওয়া যায়নি');
    const data = coerce(def, await readJson(c), true);
    await def.beforeSave?.(c, data, existing);
    if (def.hasUpdatedAt) data.updated_at = nowIso();
    const cols = Object.keys(data);
    if (cols.length) {
      try {
        await c.env.DB.prepare(`UPDATE ${def.table} SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((k) => data[k]), id).run();
      } catch (e) {
        dbError(e);
      }
    }
    await def.afterSave?.(c, id, data, existing);
    await audit(c.env, c.get('admin').id, 'update', def.entity, id, data, clientIp(c.req.raw));
    const row = await c.env.DB.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).bind(id).first();
    return ok(c, strip(def, row as Record<string, unknown>));
  });

  app.delete(`${path}/:id`, async (c) => {
    assertPerm(c, def.deletePerm || def.writePerm);
    const id = toInt(c.req.param('id'));
    const existing = await c.env.DB.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    if (!existing) fail(404, 'পাওয়া যায়নি');
    await def.beforeDelete?.(c, existing);
    try {
      await c.env.DB.prepare(`DELETE FROM ${def.table} WHERE id = ?`).bind(id).run();
    } catch (e) {
      dbError(e);
    }
    await audit(c.env, c.get('admin').id, 'delete', def.entity, id, strip(def, { ...existing }) || {}, clientIp(c.req.raw));
    return ok(c, { deleted: true });
  });
}

/** RFC 4180 CSV with BOM so Excel opens Bangla correctly. */
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const escCell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV/formula injection guard
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [columns.map((c) => escCell(c.label)).join(','), ...rows.map((r) => columns.map((c) => escCell(r[c.key])).join(','))].join('\r\n');
}

export function csvResponse(name: string, csv: string): Response {
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
}
