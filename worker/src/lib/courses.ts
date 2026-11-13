import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppBindings, Env } from '../env';
import { mediaSrc, parseVideo, titledLines, type VideoSource } from '../../../shared/media';
import { nowIso, parseJson, randomToken, sha256Hex } from './util';
import { driveFileId } from './google';

/* ---------------- Rows ---------------- */
export interface CourseCategoryRow { id: number; slug: string; name: string; description: string; icon: string; image_key: string | null; is_active: number; sort_order: number }
export interface CourseRow {
  id: number; category_id: number; slug: string; title: string; subtitle: string; description: string; cover_image: string; promo_video_url: string;
  price: number; regular_price: number; level: string; language: string; duration_text: string;
  outcomes: string; audience: string; requirements: string; includes: string; faqs: string;
  instructor_name: string; instructor_bio: string; instructor_photo: string;
  status: 'draft' | 'published' | 'coming_soon' | 'archived'; is_featured: number; sort_order: number; updated_at: string;
  category_slug?: string; category_name?: string; category_icon?: string;
}
export interface SectionRow { id: number; course_id: number; title: string; sort_order: number }
export interface LessonRow {
  id: number; course_id: number; section_id: number | null; title: string; kind: 'video' | 'link' | 'file' | 'text';
  video_url: string; link_url: string; file_key: string; body: string; duration_text: string; is_preview: number; is_active: number; sort_order: number;
}
export interface StudentRow { id: number; name: string; phone: string; email: string; password_hash: string; is_blocked: number; failed_logins: number; locked_until: string | null; last_login_at: string | null }

export const LEVEL_BN: Record<string, string> = { beginner: 'শুরু থেকে', intermediate: 'মাঝারি', advanced: 'অ্যাডভান্সড', all: 'সবার জন্য' };
/** Visible to visitors. A coming-soon course has a page but cannot be bought yet. */
export const PUBLIC_STATUSES = "('published','coming_soon')";

/* ---------------- Public view of a course (never includes lesson content) ---------------- */
export interface PublicLesson { id: number; title: string; kind: LessonRow['kind']; durationText: string; isPreview: boolean; preview: VideoSource | null }
export interface PublicSection { id: number; title: string; lessons: PublicLesson[] }

export function publicCourse(c: CourseRow, lessonCount = 0) {
  const lines = (json: string) => parseJson<string[]>(json, []).map((x) => String(x).trim()).filter(Boolean);
  return {
    id: c.id, slug: c.slug, title: c.title, subtitle: c.subtitle, description: c.description,
    categoryId: c.category_id, categorySlug: c.category_slug || '', categoryName: c.category_name || '', categoryIcon: c.category_icon || '',
    cover: mediaSrc(c.cover_image) || '',
    promoVideo: parseVideo(c.promo_video_url),
    price: c.price, regularPrice: c.regular_price > c.price ? c.regular_price : 0,
    level: c.level, levelLabel: LEVEL_BN[c.level] || c.level, language: c.language, durationText: c.duration_text,
    outcomes: lines(c.outcomes), audience: lines(c.audience), requirements: lines(c.requirements), includes: lines(c.includes),
    faqs: titledLines(lines(c.faqs)).map((f) => ({ question: f.title, answer: f.text })).filter((f) => f.answer),
    instructor: { name: c.instructor_name, bio: c.instructor_bio, photo: mediaSrc(c.instructor_photo) || '' },
    status: c.status, comingSoon: c.status === 'coming_soon', isFeatured: !!c.is_featured, lessonCount, updatedAt: c.updated_at,
  };
}
export type PublicCourse = ReturnType<typeof publicCourse>;

const COURSE_SELECT = `SELECT co.*, cc.slug AS category_slug, cc.name AS category_name, cc.icon AS category_icon,
  (SELECT COUNT(*) FROM course_lessons l WHERE l.course_id = co.id AND l.is_active = 1) AS lesson_count
  FROM courses co JOIN course_categories cc ON cc.id = co.category_id`;

export async function loadPublicCourses(env: Env, opts: { categoryId?: number; slug?: string; featuredOnly?: boolean } = {}): Promise<PublicCourse[]> {
  const where = [`co.status IN ${PUBLIC_STATUSES}`, 'cc.is_active = 1'];
  const binds: unknown[] = [];
  if (opts.categoryId) { where.push('co.category_id = ?'); binds.push(opts.categoryId); }
  if (opts.slug) { where.push('co.slug = ?'); binds.push(opts.slug); }
  if (opts.featuredOnly) where.push('co.is_featured = 1');
  const rows = (await env.DB.prepare(`${COURSE_SELECT} WHERE ${where.join(' AND ')} ORDER BY cc.sort_order, co.sort_order, co.id`).bind(...binds).all<CourseRow & { lesson_count: number }>()).results;
  return rows.map((r) => publicCourse(r, r.lesson_count));
}

export const loadCourseRow = (env: Env, slug: string) =>
  env.DB.prepare(`${COURSE_SELECT} WHERE co.slug = ?`).bind(slug).first<CourseRow & { lesson_count: number }>();

export async function loadCourseCategories(env: Env): Promise<(CourseCategoryRow & { course_count: number; min_price: number | null })[]> {
  return (await env.DB.prepare(
    `SELECT cc.*, (SELECT COUNT(*) FROM courses c WHERE c.category_id = cc.id AND c.status IN ${PUBLIC_STATUSES}) AS course_count,
            (SELECT MIN(price) FROM courses c WHERE c.category_id = cc.id AND c.status = 'published') AS min_price
     FROM course_categories cc WHERE cc.is_active = 1 ORDER BY cc.sort_order, cc.id`,
  ).all<CourseCategoryRow & { course_count: number; min_price: number | null }>()).results;
}

/** Sections with lesson titles for the public page. Only preview lessons carry their video. */
export async function loadCurriculum(env: Env, courseId: number): Promise<{ sections: SectionRow[]; lessons: LessonRow[] }> {
  const [s, l] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM course_sections WHERE course_id = ? ORDER BY sort_order, id').bind(courseId),
    env.DB.prepare('SELECT * FROM course_lessons WHERE course_id = ? AND is_active = 1 ORDER BY sort_order, id').bind(courseId),
  ]);
  return { sections: s.results as SectionRow[], lessons: l.results as LessonRow[] };
}

export function groupLessons(sections: SectionRow[], lessons: LessonRow[]): { section: SectionRow | null; lessons: LessonRow[] }[] {
  const out: { section: SectionRow | null; lessons: LessonRow[] }[] = sections.map((section) => ({ section, lessons: lessons.filter((l) => l.section_id === section.id) }));
  const orphans = lessons.filter((l) => !l.section_id || !sections.some((s) => s.id === l.section_id));
  if (orphans.length) out.push({ section: null, lessons: orphans });
  return out.filter((g) => g.lessons.length);
}

/** A private upload (private/courses/…) plays through the access-checked /learn/video route; anything else as usual. */
export const isPrivateKey = (v: string) => /^private\/courses\/[\w./-]+$/.test(v) && !v.includes('..');
/**
 * `drive`: a Google service account is configured, so a Google Drive link is played through the Worker
 * (/learn/video) — the Drive file can stay private (shared only with the service account) and its link
 * never reaches the browser.
 */
export function lessonVideo(l: Pick<LessonRow, 'id' | 'video_url'>, base = '', drive = false) {
  if (!l.video_url) return null;
  const proxied = { kind: 'file' as const, src: `${base.replace(/\/$/, '')}/learn/video/${l.id}` };
  if (isPrivateKey(l.video_url)) return proxied;
  if (l.video_url.startsWith('private/')) return null;
  if (drive && driveFileId(l.video_url) && /^https?:/.test(l.video_url)) return proxied;
  return parseVideo(l.video_url);
}

/** `base`: the Worker origin, so a private preview video also plays from the static (Pages) copy of the page. */
export function publicCurriculum(sections: SectionRow[], lessons: LessonRow[], base = '', drive = false): PublicSection[] {
  return groupLessons(sections, lessons).map((g) => ({
    id: g.section?.id ?? 0,
    title: g.section?.title || 'অন্যান্য লেসন',
    lessons: g.lessons.map((l) => ({
      id: l.id, title: l.title, kind: l.kind, durationText: l.duration_text, isPreview: !!l.is_preview,
      preview: l.is_preview && l.kind === 'video' ? lessonVideo(l, base, drive) : null,
    })),
  }));
}

/* ---------------- Students: sessions ---------------- */
const COOKIE = '__Host-student_session';
const DEV_COOKIE = 'student_session';
const TTL = 60 * 60 * 24 * 30; // 30 days

export async function createStudentSession(c: Context<AppBindings>, studentId: number): Promise<void> {
  const token = randomToken(32);
  await c.env.KV.put(`stu:${await sha256Hex(token)}`, JSON.stringify({ id: studentId, at: Date.now() }), { expirationTtl: TTL });
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, secure ? COOKIE : DEV_COOKIE, token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: TTL });
  await c.env.DB.prepare('UPDATE students SET last_login_at = ?, failed_logins = 0, locked_until = NULL WHERE id = ?').bind(nowIso(), studentId).run();
}

export async function destroyStudentSession(c: Context<AppBindings>): Promise<void> {
  const token = getCookie(c, COOKIE) || getCookie(c, DEV_COOKIE);
  if (token) await c.env.KV.delete(`stu:${await sha256Hex(token)}`);
  deleteCookie(c, COOKIE, { path: '/', secure: true });
  deleteCookie(c, DEV_COOKIE, { path: '/' });
}

/** The signed-in student, or null. Blocked students and sessions older than a password change are refused. */
export async function currentStudent(c: Context<AppBindings>): Promise<StudentRow | null> {
  const token = getCookie(c, COOKIE) || getCookie(c, DEV_COOKIE);
  if (!token) return null;
  const raw = await c.env.KV.get(`stu:${await sha256Hex(token)}`);
  if (!raw) return null;
  const s = parseJson<{ id?: number; at?: number }>(raw, {});
  if (!s.id) return null;
  const st = await c.env.DB.prepare('SELECT * FROM students WHERE id = ?').bind(s.id).first<StudentRow & { updated_at: string }>();
  if (!st || st.is_blocked) return null;
  const pwChanged = await c.env.KV.get(`stu-pw:${st.id}`);
  if (pwChanged && Number(pwChanged) > (s.at || 0)) return null;
  return st;
}

/** Sign every device out (after an admin resets the password or blocks the student). */
export const revokeStudentSessions = (env: Env, studentId: number) => env.KV.put(`stu-pw:${studentId}`, String(Date.now()), { expirationTtl: TTL });

/* ---------------- Enrollments ---------------- */
export async function activeEnrollment(env: Env, studentId: number, courseId: number) {
  return env.DB.prepare("SELECT * FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'active'").bind(studentId, courseId).first<{ id: number; created_at: string }>();
}

/**
 * Open the courses of a paid course order for its student. Called only from confirmPayment (after a gateway
 * confirmation or an admin's verification) — never when the order is created. Idempotent; a revoked
 * enrollment is re-activated by a new paid order.
 */
export async function grantCourseOrder(env: Env, orderId: number): Promise<number> {
  const o = await env.DB.prepare("SELECT id, student_id, payment_status FROM orders WHERE id = ? AND kind = 'course'").bind(orderId).first<{ id: number; student_id: number | null; payment_status: string }>();
  if (!o || !o.student_id || o.payment_status !== 'paid') return 0;
  const items = (await env.DB.prepare('SELECT course_id FROM order_items WHERE order_id = ? AND course_id IS NOT NULL').bind(orderId).all<{ course_id: number }>()).results;
  for (const it of items) {
    await env.DB.prepare(
      `INSERT INTO enrollments (student_id, course_id, order_id, status, source) VALUES (?, ?, ?, 'active', 'purchase')
       ON CONFLICT(student_id, course_id) DO UPDATE SET status = 'active', order_id = excluded.order_id, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    ).bind(o.student_id, it.course_id, orderId).run();
  }
  return items.length;
}

/* ---------------- Lesson content (enrolled students and previews only) ---------------- */
export function lessonContent(l: LessonRow, drive = false) {
  return {
    id: l.id, title: l.title, kind: l.kind, durationText: l.duration_text, body: l.body,
    video: lessonVideo(l, '', drive),
    link: /^https:\/\/\S+$/.test(l.link_url) ? l.link_url : '',
    hasFile: !!l.file_key,
  };
}
export type LessonContent = ReturnType<typeof lessonContent>;
