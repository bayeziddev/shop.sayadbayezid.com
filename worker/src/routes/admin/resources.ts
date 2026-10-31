import type { Hono } from 'hono';
import type { AppBindings } from '../../env';
import { registerCrud, type ResourceDef } from './crud';
import { fail } from '../../lib/http';
import { hashPassword } from '../../lib/crypto';
import { ROLES } from '../../../../shared/status';
import { revokeAllSessionsFor } from '../../lib/auth';
import { nowIso } from '../../lib/util';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CODE = /^[A-Za-z0-9_-]{3,40}$/;

export const categoriesDef: ResourceDef = {
  table: 'categories', entity: 'category', writePerm: 'catalog.write', hasUpdatedAt: true,
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
};

export const packagesDef: ResourceDef = {
  table: 'packages', entity: 'package', writePerm: 'catalog.write', hasUpdatedAt: true,
  searchCols: ['name', 'slug'], filterCols: ['category_id', 'status'], orderBy: 'category_id, sort_order, id',
  fields: [
    { name: 'category_id', type: 'int', required: true, label: 'ক্যাটাগরি' },
    { name: 'name', type: 'text', required: true, max: 150, label: 'নাম' },
    { name: 'slug', type: 'text', required: true, max: 80, pattern: SLUG, label: 'স্লাগ' },
    { name: 'tier', type: 'text', max: 30, default: 'basic', label: 'স্তর' },
    { name: 'short_description', type: 'text', max: 300, default: '', label: 'সংক্ষিপ্ত বিবরণ' },
    { name: 'description', type: 'text', max: 8000, default: '', label: 'বিস্তারিত বিবরণ' },
    { name: 'base_price', type: 'int', required: true, min: 0, label: 'মূল দাম' },
    { name: 'delivery_days', type: 'int', default: 7, min: 1, label: 'ডেলিভারির দিন' },
    { name: 'demo_url', type: 'text', max: 500, default: '', pattern: /^(https?:\/\/\S+)?$/, label: 'লাইভ ডেমো লিংক' },
    { name: 'demo_video_key', type: 'text', max: 300, default: null, label: 'ডেমো ভিডিও' },
    { name: 'images', type: 'json', default: '[]', max: 4000, label: 'ছবি' },
    { name: 'features', type: 'json', default: '[]', max: 8000, label: 'ফিচার তালিকা' },
    { name: 'status', type: 'enum', values: ['active', 'inactive', 'coming_soon'], default: 'active', label: 'অবস্থা' },
    { name: 'is_featured', type: 'bool', default: 0, label: 'হোমপেজে দেখান' },
    { name: 'sort_order', type: 'int', default: 0, label: 'ক্রম' },
    { name: 'ai_draft', type: 'json', default: null, max: 12000, label: 'এআই খসড়া' },
  ],
};

export const addonsDef: ResourceDef = {
  table: 'package_addons', entity: 'addon', writePerm: 'catalog.write', filterCols: ['package_id'], orderBy: 'sort_order, id',
  fields: [
    { name: 'package_id', type: 'int', required: true, label: 'প্যাকেজ' },
    { name: 'name', type: 'text', required: true, max: 120, label: 'নাম' },
    { name: 'description', type: 'text', max: 300, default: '', label: 'বিবরণ' },
    { name: 'price_delta', type: 'int', required: true, min: 0, label: 'অতিরিক্ত দাম' },
    { name: 'max_quantity', type: 'int', default: 1, min: 1, label: 'সর্বোচ্চ সংখ্যা' },
    { name: 'is_active', type: 'bool', default: 1, label: 'সক্রিয়' },
    { name: 'sort_order', type: 'int', default: 0, label: 'ক্রম' },
  ],
};

export const offersDef: ResourceDef = {
  table: 'offers', entity: 'offer', writePerm: 'marketing.write', filterCols: ['scope', 'scope_id', 'is_active'],
  fields: [
    { name: 'scope', type: 'enum', values: ['category', 'package'], required: true, label: 'প্রযোজ্য' },
    { name: 'scope_id', type: 'int', required: true, label: 'ক্যাটাগরি/প্যাকেজ' },
    { name: 'title', type: 'text', max: 150, default: '', label: 'শিরোনাম' },
    { name: 'discount_type', type: 'enum', values: ['percent', 'flat'], required: true, label: 'ছাড়ের ধরন' },
    { name: 'discount_value', type: 'int', required: true, min: 1, label: 'ছাড়ের পরিমাণ' },
    { name: 'starts_at', type: 'datetime', default: null, label: 'শুরু' },
    { name: 'ends_at', type: 'datetime', default: null, label: 'শেষ' },
    { name: 'show_timer', type: 'bool', default: 1, label: 'টাইমার দেখান' },
    { name: 'is_active', type: 'bool', default: 1, label: 'সক্রিয়' },
  ],
  beforeSave: (_c, d, ex) => {
    const type = d.discount_type ?? ex?.discount_type;
    const val = Number(d.discount_value ?? ex?.discount_value);
    if (type === 'percent' && val > 90) fail(422, 'শতকরা ছাড় ৯০% এর বেশি হতে পারে না');
    const s = d.starts_at ?? ex?.starts_at, e = d.ends_at ?? ex?.ends_at;
    if (s && e && String(e) <= String(s)) fail(422, 'শেষের সময় শুরুর পরে হতে হবে');
  },
};

export const couponsDef: ResourceDef = {
  table: 'coupons', entity: 'coupon', writePerm: 'marketing.write', searchCols: ['code', 'description'], filterCols: ['is_active', 'scope'],
  fields: [
    { name: 'code', type: 'text', required: true, max: 40, pattern: CODE, label: 'কোড' },
    { name: 'description', type: 'text', max: 300, default: '', label: 'বিবরণ' },
    { name: 'discount_type', type: 'enum', values: ['percent', 'flat'], required: true, label: 'ছাড়ের ধরন' },
    { name: 'discount_value', type: 'int', required: true, min: 1, label: 'ছাড়ের পরিমাণ' },
    { name: 'scope', type: 'enum', values: ['sitewide', 'category', 'package'], default: 'sitewide', label: 'প্রযোজ্য' },
    { name: 'scope_id', type: 'int', default: null, label: 'ক্যাটাগরি/প্যাকেজ' },
    { name: 'starts_at', type: 'datetime', default: null, label: 'শুরু' },
    { name: 'expires_at', type: 'datetime', default: null, label: 'মেয়াদ শেষ' },
    { name: 'usage_limit', type: 'int', default: null, min: 1, label: 'ব্যবহার সীমা' },
    { name: 'min_subtotal', type: 'int', default: 0, min: 0, label: 'ন্যূনতম অর্ডার' },
    { name: 'show_on_card', type: 'bool', default: 0, label: 'কার্ডে দেখান' },
    { name: 'is_active', type: 'bool', default: 1, label: 'সক্রিয়' },
  ],
  beforeSave: (_c, d, ex) => {
    if (typeof d.code === 'string') d.code = d.code.toUpperCase();
    const scope = d.scope ?? ex?.scope;
    if (scope !== 'sitewide' && !(d.scope_id ?? ex?.scope_id)) fail(422, 'কোন ক্যাটাগরি/প্যাকেজে প্রযোজ্য তা বেছে নিন');
    if ((d.discount_type ?? ex?.discount_type) === 'percent' && Number(d.discount_value ?? ex?.discount_value) > 90) fail(422, 'শতকরা ছাড় ৯০% এর বেশি হতে পারে না');
  },
};

export const bannersDef: ResourceDef = {
  table: 'banners', entity: 'banner', writePerm: 'marketing.write', searchCols: ['title'], filterCols: ['kind', 'is_active'], orderBy: 'sort_order, id DESC',
  fields: [
    { name: 'kind', type: 'enum', values: ['bar', 'popup'], required: true, label: 'ধরন' },
    { name: 'title', type: 'text', required: true, max: 150, label: 'শিরোনাম' },
    { name: 'body', type: 'text', max: 600, default: '', label: 'লেখা' },
    { name: 'cta_label', type: 'text', max: 60, default: '', label: 'বোতামের লেখা' },
    { name: 'cta_url', type: 'text', max: 500, default: '', pattern: /^((https?:\/\/|\/)\S*)?$/, label: 'বোতামের লিংক' },
    { name: 'image_key', type: 'text', max: 300, default: null, label: 'ছবি' },
    { name: 'target', type: 'enum', values: ['all', 'home', 'category', 'package', 'landing'], default: 'all', label: 'কোথায় দেখাবে' },
    { name: 'starts_at', type: 'datetime', default: null, label: 'শুরু' },
    { name: 'ends_at', type: 'datetime', default: null, label: 'শেষ' },
    { name: 'is_active', type: 'bool', default: 1, label: 'সক্রিয়' },
    { name: 'sort_order', type: 'int', default: 0, label: 'ক্রম' },
  ],
};

export const faqsDef: ResourceDef = {
  table: 'faqs', entity: 'faq', writePerm: 'marketing.write', searchCols: ['question', 'answer'], filterCols: ['scope', 'package_id', 'is_active'], orderBy: 'scope, sort_order, id',
  fields: [
    { name: 'question', type: 'text', required: true, max: 300, label: 'প্রশ্ন' },
    { name: 'answer', type: 'text', required: true, max: 3000, label: 'উত্তর' },
    { name: 'scope', type: 'enum', values: ['sitewide', 'package'], default: 'sitewide', label: 'প্রযোজ্য' },
    { name: 'package_id', type: 'int', default: null, label: 'প্যাকেজ' },
    { name: 'sort_order', type: 'int', default: 0, label: 'ক্রম' },
    { name: 'is_active', type: 'bool', default: 1, label: 'সক্রিয়' },
  ],
  beforeSave: (_c, d, ex) => {
    if ((d.scope ?? ex?.scope) === 'package' && !(d.package_id ?? ex?.package_id)) fail(422, 'প্যাকেজ বেছে নিন');
  },
};

export const reviewsDef: ResourceDef = {
  table: 'reviews', entity: 'review', writePerm: 'reviews.write', searchCols: ['author_name', 'body'], filterCols: ['status', 'package_id', 'is_verified'], orderBy: 'created_at DESC',
  fields: [
    { name: 'author_name', type: 'text', required: true, max: 100, label: 'নাম' },
    { name: 'author_business', type: 'text', max: 150, default: '', label: 'ব্যবসা' },
    { name: 'package_id', type: 'int', default: null, label: 'প্যাকেজ' },
    { name: 'rating', type: 'int', required: true, min: 1, label: 'রেটিং' },
    { name: 'body', type: 'text', required: true, max: 2000, label: 'রিভিউ' },
    { name: 'status', type: 'enum', values: ['pending', 'approved', 'rejected'], default: 'pending', label: 'অবস্থা' },
  ],
  // is_verified is never editable: it is set only when a review is submitted from a real order's portal.
  beforeSave: (_c, d) => {
    if (d.rating !== undefined && (Number(d.rating) < 1 || Number(d.rating) > 5)) fail(422, 'রেটিং ১–৫ হতে হবে');
  },
};

export const landingDef: ResourceDef = {
  table: 'landing_pages', entity: 'landing_page', writePerm: 'marketing.write', hasUpdatedAt: true, searchCols: ['title', 'slug'], filterCols: ['status'], orderBy: 'updated_at DESC',
  fields: [
    { name: 'title', type: 'text', required: true, max: 200, label: 'শিরোনাম' },
    { name: 'slug', type: 'text', required: true, max: 80, pattern: SLUG, label: 'স্লাগ' },
    { name: 'status', type: 'enum', values: ['draft', 'published', 'retired'], default: 'draft', label: 'অবস্থা' },
    { name: 'blocks', type: 'json', default: '[]', max: 60000, label: 'ব্লক' },
    { name: 'seo_title', type: 'text', max: 200, default: '', label: 'এসইও শিরোনাম' },
    { name: 'seo_description', type: 'text', max: 300, default: '', label: 'এসইও বিবরণ' },
    { name: 'utm_source', type: 'text', max: 100, default: '', label: 'ইউটিএম সোর্স' },
    { name: 'utm_medium', type: 'text', max: 100, default: '', label: 'ইউটিএম মিডিয়াম' },
    { name: 'utm_campaign', type: 'text', max: 200, default: '', label: 'ইউটিএম ক্যাম্পেইন' },
  ],
  beforeSave: (_c, d, ex) => {
    if (d.status === 'published' && ex?.status !== 'published') d.published_at = nowIso();
    if (d.status === 'retired' && ex?.status !== 'retired') d.retired_at = nowIso();
  },
};

export const staffDef: ResourceDef = {
  table: 'admins', entity: 'admin', writePerm: 'staff.write', searchCols: ['name', 'email'], filterCols: ['role', 'is_active'], orderBy: 'id', hidden: ['password_hash'],
  fields: [
    { name: 'name', type: 'text', required: true, max: 100, label: 'নাম' },
    { name: 'email', type: 'text', required: true, max: 200, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, label: 'ইমেইল' },
    { name: 'role', type: 'enum', values: ROLES, required: true, label: 'ভূমিকা' },
    { name: 'is_active', type: 'bool', default: 1, label: 'সক্রিয়' },
  ],
  beforeSave: async (c, d, ex) => {
    if (typeof d.email === 'string') d.email = d.email.toLowerCase();
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    if (body.password) {
      if (body.password.length < 10) fail(422, 'পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে');
      d.password_hash = await hashPassword(body.password);
    } else if (!ex) fail(422, 'নতুন স্টাফের জন্য পাসওয়ার্ড দিন');
    const me = c.get('admin');
    if (ex && ex.id === me.id && (d.role && d.role !== 'super_admin' || d.is_active === 0)) fail(422, 'নিজের সুপার অ্যাডমিন অনুমতি সরানো যাবে না');
  },
  afterSave: async (c, id, d) => {
    if (d.password_hash || d.is_active === 0 || d.role) await revokeAllSessionsFor(c.env, id);
  },
  beforeDelete: (c, ex) => {
    if (ex.id === c.get('admin').id) fail(422, 'নিজের অ্যাকাউন্ট মুছতে পারবেন না');
  },
};

export function registerResources(app: Hono<AppBindings>) {
  registerCrud(app, '/categories', categoriesDef);
  registerCrud(app, '/packages', packagesDef);
  registerCrud(app, '/addons', addonsDef);
  registerCrud(app, '/offers', offersDef);
  registerCrud(app, '/coupons', couponsDef);
  registerCrud(app, '/banners', bannersDef);
  registerCrud(app, '/faqs', faqsDef);
  registerCrud(app, '/reviews', reviewsDef);
  registerCrud(app, '/landing-pages', landingDef);
  registerCrud(app, '/staff', staffDef);
}
