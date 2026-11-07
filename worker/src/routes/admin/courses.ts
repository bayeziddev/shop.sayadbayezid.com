import type { Hono } from 'hono';
import type { AppBindings } from '../../env';
import { registerCrud, type ResourceDef } from './crud';
import { fail, ok, readJson } from '../../lib/http';
import { requirePerm } from '../../lib/auth';
import { hashPassword } from '../../lib/crypto';
import { audit } from '../../lib/audit';
import { clampStr, clientIp, isEmail, normalizeBdPhone, nowIso, parseJson, toInt } from '../../lib/util';
import { mediaSrc, isHttpUrl } from '../../../../shared/media';
import { isPrivateKey, revokeStudentSessions } from '../../lib/courses';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Learning order: chapter by chapter, then the lessons inside each chapter. */
const LESSON_ORDER = 'COALESCE((SELECT s.sort_order FROM course_sections s WHERE s.id = course_lessons.section_id), 1e9), sort_order, id';

function checkMedia(v: unknown, label: string, field: string) {
  if (v === undefined || v === null || v === '') return;
  if (!mediaSrc(String(v))) fail(422, `“${label}” — আপলোড করা ফাইল বা https:// লিংক দিন`, field);
}
function checkList(v: unknown, label: string, field: string, max = 40) {
  if (v === undefined) return;
  const arr = parseJson<unknown[]>(String(v), []);
  if (!Array.isArray(arr) || arr.length > max || arr.some((x) => typeof x !== 'string' || x.length > 600)) fail(422, `“${label}” — সর্বোচ্চ ${max}টি লাইন`, field);
}

export const courseCategoriesDef: ResourceDef = {
  table: 'course_categories', entity: 'course_category', writePerm: 'catalog.write', hasUpdatedAt: true,
  searchCols: ['name', 'slug'], filterCols: ['is_active'], orderBy: 'sort_order, id',
  fields: [
    { name: 'name', type: 'text', required: true, max: 100, label: 'নাম' },
    { name: 'slug', type: 'text', required: true, max: 80, pattern: SLUG, label: 'স্লাগ' },
    { name: 'description', type: 'text', max: 500, default: '', label: 'বিবরণ' },
    { name: 'icon', type: 'text', max: 8, default: '', label: 'আইকন' },
    { name: 'image_key', type: 'text', max: 300, default: null, label: 'ছবি' },
    { name: 'is_active', type: 'bool', default: 1, label: 'সক্রিয়' },
    { name: 'sort_order', type: 'int', default: 0, label: 'ক্রম' },
  ],
  beforeSave: (_c, d) => checkMedia(d.image_key, 'ছবি', 'image_key'),
  beforeDelete: async (c, ex) => {
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM courses WHERE category_id = ?').bind(ex.id).first<{ n: number }>();
    if (n?.n) fail(409, 'এই ক্যাটাগরিতে কোর্স আছে — আগে কোর্সগুলো অন্য ক্যাটাগরিতে সরান, অথবা ক্যাটাগরিটি নিষ্ক্রিয় করুন');
  },
};

export const coursesDef: ResourceDef = {
  table: 'courses', entity: 'course', writePerm: 'catalog.write', hasUpdatedAt: true,
  searchCols: ['title', 'slug', 'subtitle'], filterCols: ['category_id', 'status', 'is_featured'], orderBy: 'category_id, sort_order, id',
  fields: [
    { name: 'category_id', type: 'int', required: true, label: 'ক্যাটাগরি' },
    { name: 'title', type: 'text', required: true, max: 200, label: 'কোর্সের নাম' },
    { name: 'slug', type: 'text', required: true, max: 80, pattern: SLUG, label: 'স্লাগ' },
    { name: 'subtitle', type: 'text', max: 300, default: '', label: 'এক লাইনে' },
    { name: 'description', type: 'text', max: 12000, default: '', label: 'বিস্তারিত' },
    { name: 'cover_image', type: 'text', max: 500, default: '', label: 'কভার ছবি' },
    { name: 'promo_video_url', type: 'text', max: 500, default: '', label: 'পরিচিতি ভিডিও' },
    { name: 'price', type: 'int', required: true, min: 0, label: 'দাম' },
    { name: 'regular_price', type: 'int', default: 0, min: 0, label: 'আগের দাম' },
    { name: 'level', type: 'enum', values: ['beginner', 'intermediate', 'advanced', 'all'], default: 'beginner', label: 'লেভেল' },
    { name: 'language', type: 'text', max: 40, default: 'বাংলা', label: 'ভাষা' },
    { name: 'duration_text', type: 'text', max: 80, default: '', label: 'সময়কাল' },
    { name: 'outcomes', type: 'json', default: '[]', max: 12000, label: 'যা শিখবেন' },
    { name: 'audience', type: 'json', default: '[]', max: 6000, label: 'কার জন্য' },
    { name: 'requirements', type: 'json', default: '[]', max: 6000, label: 'যা লাগবে' },
    { name: 'includes', type: 'json', default: '[]', max: 6000, label: 'যা যা পাচ্ছেন' },
    { name: 'faqs', type: 'json', default: '[]', max: 15000, label: 'প্রশ্নোত্তর' },
    { name: 'instructor_name', type: 'text', max: 100, default: '', label: 'ইনস্ট্রাক্টর' },
    { name: 'instructor_bio', type: 'text', max: 2000, default: '', label: 'ইনস্ট্রাক্টরের পরিচিতি' },
    { name: 'instructor_photo', type: 'text', max: 500, default: '', label: 'ইনস্ট্রাক্টরের ছবি' },
    { name: 'status', type: 'enum', values: ['draft', 'published', 'coming_soon', 'archived'], default: 'draft', label: 'অবস্থা' },
    { name: 'is_featured', type: 'bool', default: 0, label: 'হোমপেজে দেখান' },
    { name: 'sort_order', type: 'int', default: 0, label: 'ক্রম' },
  ],
  beforeSave: async (c, d, ex) => {
    checkMedia(d.cover_image, 'কভার ছবি', 'cover_image');
    checkMedia(d.instructor_photo, 'ইনস্ট্রাক্টরের ছবি', 'instructor_photo');
    if (d.promo_video_url && !isHttpUrl(String(d.promo_video_url)) && !mediaSrc(String(d.promo_video_url))) fail(422, 'পরিচিতি ভিডিওর জন্য ইউটিউব/ভিমিও/ড্রাইভ লিংক দিন অথবা ফাইল আপলোড করুন', 'promo_video_url');
    if (String(d.promo_video_url || '').startsWith('private/')) fail(422, 'পরিচিতি ভিডিও সবাই দেখে — এটি পাবলিক আপলোড বা লিংক হতে হবে', 'promo_video_url');
    for (const [k, label] of [['outcomes', 'যা শিখবেন'], ['audience', 'কার জন্য'], ['requirements', 'যা লাগবে'], ['includes', 'যা যা পাচ্ছেন'], ['faqs', 'প্রশ্নোত্তর']] as const) checkList(d[k], label, k);
    const status = d.status ?? ex?.status;
    const price = Number(d.price ?? ex?.price ?? 0);
    const regular = Number(d.regular_price ?? ex?.regular_price ?? 0);
    if (regular && regular < price) fail(422, '“আগের দাম” বর্তমান দামের চেয়ে কম হতে পারে না (না থাকলে ০ দিন)', 'regular_price');
    if (d.category_id !== undefined) {
      const cat = await c.env.DB.prepare('SELECT id FROM course_categories WHERE id = ?').bind(d.category_id).first();
      if (!cat) fail(422, 'ক্যাটাগরি বেছে নিন', 'category_id');
    }
    if (status === 'published' && (!ex || ex.status !== 'published')) {
      const n = ex ? await c.env.DB.prepare('SELECT COUNT(*) AS n FROM course_lessons WHERE course_id = ? AND is_active = 1').bind(ex.id).first<{ n: number }>() : { n: 0 };
      if (!n?.n) fail(422, 'প্রকাশের আগে অন্তত একটি লেসন যোগ করুন — আপাতত “শীঘ্রই আসছে” রাখুন', 'status');
    }
  },
  beforeDelete: async (c, ex) => {
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ?').bind(ex.id).first<{ n: number }>();
    if (n?.n) fail(409, 'এই কোর্সে শিক্ষার্থী ভর্তি আছেন — মুছবেন না; “আর্কাইভ” করুন (ভর্তি শিক্ষার্থীরা দেখতে থাকবেন)');
  },
};

export const courseSectionsDef: ResourceDef = {
  table: 'course_sections', entity: 'course_section', writePerm: 'catalog.write',
  filterCols: ['course_id'], orderBy: 'sort_order, id',
  fields: [
    { name: 'course_id', type: 'int', required: true, label: 'কোর্স' },
    { name: 'title', type: 'text', required: true, max: 200, label: 'অধ্যায়ের নাম' },
    { name: 'sort_order', type: 'int', default: 0, label: 'ক্রম' },
  ],
};

export const courseLessonsDef: ResourceDef = {
  table: 'course_lessons', entity: 'course_lesson', writePerm: 'catalog.write', hasUpdatedAt: true,
  searchCols: ['title'], filterCols: ['course_id', 'section_id', 'is_preview', 'is_active'], orderBy: LESSON_ORDER,
  fields: [
    { name: 'course_id', type: 'int', required: true, label: 'কোর্স' },
    { name: 'section_id', type: 'int', default: null, label: 'অধ্যায়' },
    { name: 'title', type: 'text', required: true, max: 200, label: 'লেসনের নাম' },
    { name: 'kind', type: 'enum', values: ['video', 'link', 'file', 'text'], default: 'video', label: 'ধরন' },
    { name: 'video_url', type: 'text', max: 500, default: '', label: 'ভিডিও' },
    { name: 'link_url', type: 'text', max: 1000, default: '', label: 'প্রাইভেট লিংক' },
    { name: 'file_key', type: 'text', max: 300, default: '', label: 'ফাইল' },
    { name: 'body', type: 'text', max: 20000, default: '', label: 'নোট' },
    { name: 'duration_text', type: 'text', max: 40, default: '', label: 'সময়' },
    { name: 'is_preview', type: 'bool', default: 0, label: 'ফ্রি প্রিভিউ' },
    { name: 'is_active', type: 'bool', default: 1, label: 'সক্রিয়' },
    { name: 'sort_order', type: 'int', default: 0, label: 'ক্রম' },
  ],
  beforeSave: async (c, d, ex) => {
    const v = String(d.video_url ?? '');
    if (v && !isPrivateKey(v) && !isHttpUrl(v) && !mediaSrc(v)) fail(422, 'ভিডিওর জন্য ইউটিউব (আনলিস্টেড) / ভিমিও / ড্রাইভ লিংক দিন অথবা প্রাইভেট ভিডিও আপলোড করুন', 'video_url');
    if (v.startsWith('private/') && !isPrivateKey(v)) fail(422, 'ভিডিও ফাইলটি সঠিক নয় — আবার আপলোড করুন', 'video_url');
    if (d.link_url && !/^https:\/\/\S+$/.test(String(d.link_url))) fail(422, 'লিংক https:// দিয়ে শুরু হতে হবে', 'link_url');
    if (d.file_key && !isPrivateKey(String(d.file_key))) fail(422, 'ফাইলটি “প্রাইভেট ফাইল আপলোড” দিয়ে দিন', 'file_key');
    const courseId = d.course_id ?? ex?.course_id;
    if (d.course_id !== undefined && !(await c.env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(d.course_id).first())) fail(422, 'কোর্স পাওয়া যায়নি', 'course_id');
    const sectionId = d.section_id !== undefined ? d.section_id : ex?.section_id;
    if (sectionId) {
      const s = await c.env.DB.prepare('SELECT id FROM course_sections WHERE id = ? AND course_id = ?').bind(sectionId, courseId).first();
      if (!s) fail(422, 'অধ্যায়টি এই কোর্সের নয়', 'section_id');
    }
  },
};

export const studentsDef: ResourceDef = {
  table: 'students', entity: 'student', writePerm: 'orders.write', hasUpdatedAt: true, hidden: ['password_hash'],
  searchCols: ['name', 'phone', 'email'], filterCols: ['is_blocked'], orderBy: 'id DESC',
  fields: [
    { name: 'name', type: 'text', required: true, max: 100, label: 'নাম' },
    { name: 'phone', type: 'text', required: true, max: 20, label: 'মোবাইল' },
    { name: 'email', type: 'text', max: 200, default: '', label: 'ইমেইল' },
    { name: 'is_blocked', type: 'bool', default: 0, label: 'ব্লক' },
    { name: 'notes', type: 'text', max: 2000, default: '', label: 'নোট' },
  ],
  beforeSave: async (c, d, ex) => {
    if (d.phone !== undefined) {
      const p = normalizeBdPhone(String(d.phone));
      if (!p) fail(422, 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন', 'phone');
      d.phone = p;
    }
    if (d.email && !isEmail(String(d.email))) fail(422, 'ইমেইল সঠিক নয়', 'email');
    // A password is set only from this form, by staff (e.g. a student who forgot theirs and asked on WhatsApp).
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    if (body.password) {
      if (body.password.length < 6) fail(422, 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে', 'password');
      d.password_hash = await hashPassword(body.password);
      d.failed_logins = 0;
      d.locked_until = null;
    } else if (!ex) fail(422, 'নতুন শিক্ষার্থীর জন্য পাসওয়ার্ড দিন', 'password');
  },
  afterSave: async (c, id, d, ex) => {
    if (ex && (d.password_hash || (d.is_blocked === 1 && !ex.is_blocked))) await revokeStudentSessions(c.env, id);
  },
};

export const enrollmentsDef: ResourceDef = {
  table: 'enrollments', entity: 'enrollment', writePerm: 'orders.write',
  filterCols: ['student_id', 'course_id', 'status', 'source'], orderBy: 'id DESC', hasUpdatedAt: true,
  fields: [
    { name: 'student_id', type: 'int', required: true, label: 'শিক্ষার্থী' },
    { name: 'course_id', type: 'int', required: true, label: 'কোর্স' },
    { name: 'status', type: 'enum', values: ['active', 'revoked'], default: 'active', label: 'অবস্থা' },
    { name: 'note', type: 'text', max: 500, default: '', label: 'নোট' },
  ],
  beforeSave: async (c, d, ex) => {
    if (ex && ((d.student_id !== undefined && d.student_id !== ex.student_id) || (d.course_id !== undefined && d.course_id !== ex.course_id))) fail(422, 'শিক্ষার্থী বা কোর্স বদলানো যায় না — নতুন এনরোলমেন্ট দিন');
    if (!ex) {
      // A hand-made enrollment (gift, offline payment …). Paid orders create their own.
      d.source = 'admin';
      if (!(await c.env.DB.prepare('SELECT id FROM students WHERE id = ?').bind(d.student_id).first())) fail(422, 'শিক্ষার্থী পাওয়া যায়নি', 'student_id');
      if (!(await c.env.DB.prepare('SELECT id FROM courses WHERE id = ?').bind(d.course_id).first())) fail(422, 'কোর্স পাওয়া যায়নি', 'course_id');
    }
  },
};

/** Students list with how many courses each has; enrollments joined with names (for the admin tables). */
export function registerCourseAdmin(app: Hono<AppBindings>) {
  app.get('/students', async (c) => {
    const q = (c.req.query('q') || '').trim();
    const page = Math.max(1, toInt(c.req.query('page'), 1));
    const per = Math.min(200, Math.max(1, toInt(c.req.query('per'), 25)));
    const where: string[] = [];
    const binds: unknown[] = [];
    if (q) { where.push('(s.name LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (c.req.query('is_blocked')) { where.push('s.is_blocked = ?'); binds.push(toInt(c.req.query('is_blocked'))); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [cnt, rows] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM students s ${w}`).bind(...binds),
      c.env.DB.prepare(`SELECT s.id, s.name, s.phone, s.email, s.is_blocked, s.last_login_at, s.notes, s.created_at,
        (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = s.id AND e.status = 'active') AS courses
        FROM students s ${w} ORDER BY s.id DESC LIMIT ? OFFSET ?`).bind(...binds, per, (page - 1) * per),
    ]);
    return ok(c, { items: rows.results, total: (cnt.results[0] as { n: number }).n, page, perPage: per });
  });

  app.get('/enrollments', async (c) => {
    const where: string[] = [];
    const binds: unknown[] = [];
    for (const k of ['student_id', 'course_id', 'status', 'source']) {
      const v = c.req.query(k);
      if (v) { where.push(`e.${k} = ?`); binds.push(v); }
    }
    const q = (c.req.query('q') || '').trim();
    if (q) { where.push('(s.name LIKE ? OR s.phone LIKE ? OR c.title LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(1, toInt(c.req.query('page'), 1));
    const per = Math.min(200, Math.max(1, toInt(c.req.query('per'), 25)));
    const from = 'FROM enrollments e JOIN students s ON s.id = e.student_id JOIN courses c ON c.id = e.course_id LEFT JOIN orders o ON o.id = e.order_id';
    const [cnt, rows] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COUNT(*) AS n ${from} ${w}`).bind(...binds),
      c.env.DB.prepare(`SELECT e.*, s.name AS student_name, s.phone AS student_phone, c.title AS course_title, o.order_number,
        (SELECT COUNT(*) FROM lesson_progress p WHERE p.student_id = e.student_id AND p.course_id = e.course_id) AS done,
        (SELECT COUNT(*) FROM course_lessons l WHERE l.course_id = e.course_id AND l.is_active = 1) AS total
        ${from} ${w} ORDER BY e.id DESC LIMIT ? OFFSET ?`).bind(...binds, per, (page - 1) * per),
    ]);
    return ok(c, { items: rows.results, total: (cnt.results[0] as { n: number }).n, page, perPage: per });
  });

  /** Whole curriculum of one course in one call (the course editor). */
  app.get('/courses/:id/curriculum', async (c) => {
    const id = toInt(c.req.param('id'));
    const [sections, lessons] = await c.env.DB.batch([
      c.env.DB.prepare('SELECT * FROM course_sections WHERE course_id = ? ORDER BY sort_order, id').bind(id),
      c.env.DB.prepare(`SELECT * FROM course_lessons WHERE course_id = ? ORDER BY ${LESSON_ORDER}`).bind(id),
    ]);
    return ok(c, { sections: sections.results, lessons: lessons.results });
  });

  /** Quick grant from a student's row: phone + course, creates the account when needed. */
  app.post('/enrollments/grant', requirePerm('orders.write'), async (c) => {
    const b = await readJson<{ phone?: string; name?: string; password?: string; courseId?: number; note?: string }>(c);
    const phone = normalizeBdPhone(String(b.phone || ''));
    if (!phone) fail(422, 'সঠিক মোবাইল নম্বর দিন', 'phone');
    const course = await c.env.DB.prepare('SELECT id, title FROM courses WHERE id = ?').bind(toInt(b.courseId)).first<{ id: number; title: string }>();
    if (!course) fail(422, 'কোর্স বেছে নিন', 'courseId');
    let st = await c.env.DB.prepare('SELECT id FROM students WHERE phone = ?').bind(phone).first<{ id: number }>();
    let created = false;
    if (!st) {
      const name = clampStr(b.name, 100);
      if (!name) fail(422, 'নতুন শিক্ষার্থীর নাম দিন', 'name');
      if (!b.password || b.password.length < 6) fail(422, 'নতুন শিক্ষার্থীর জন্য কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন', 'password');
      st = await c.env.DB.prepare('INSERT INTO students (name, phone, password_hash) VALUES (?, ?, ?) RETURNING id').bind(name, phone, await hashPassword(b.password)).first<{ id: number }>();
      created = true;
    }
    await c.env.DB.prepare(`INSERT INTO enrollments (student_id, course_id, status, source, note) VALUES (?, ?, 'active', 'admin', ?)
      ON CONFLICT(student_id, course_id) DO UPDATE SET status = 'active', note = excluded.note, updated_at = ?`).bind(st!.id, course.id, clampStr(b.note, 500), nowIso()).run();
    await audit(c.env, c.get('admin').id, 'grant', 'enrollment', st!.id, { courseId: course.id, created }, clientIp(c.req.raw));
    return ok(c, { studentId: st!.id, created, course: course.title }, 201);
  });

  registerCrud(app, '/course-categories', courseCategoriesDef);
  registerCrud(app, '/courses', coursesDef);
  registerCrud(app, '/course-sections', courseSectionsDef);
  registerCrud(app, '/course-lessons', courseLessonsDef);
  registerCrud(app, '/students', studentsDef);
  registerCrud(app, '/enrollments', enrollmentsDef);
}
