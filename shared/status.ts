/** Project pipeline (Section 5). Order matters. */
export const PROJECT_STATUSES = [
  'pending_payment',
  'confirmed',
  'requirements_collected',
  'in_development',
  'client_review',
  'revisions',
  'delivered',
  'completed',
  'cancelled',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_BN: Record<ProjectStatus, string> = {
  pending_payment: 'পেমেন্টের অপেক্ষায়',
  confirmed: 'নিশ্চিত হয়েছে',
  requirements_collected: 'তথ্য সংগ্রহ সম্পন্ন',
  in_development: 'ডেভেলপমেন্ট চলছে',
  client_review: 'আপনার রিভিউয়ের অপেক্ষায়',
  revisions: 'সংশোধন চলছে',
  delivered: 'ডেলিভারি সম্পন্ন',
  completed: 'প্রজেক্ট সম্পূর্ণ',
  cancelled: 'বাতিল',
};

/** Allowed transitions. `confirmed` can only be reached by a confirmed payment (never manually). */
export const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  pending_payment: ['cancelled'],
  confirmed: ['requirements_collected', 'in_development', 'cancelled'],
  requirements_collected: ['in_development', 'cancelled'],
  in_development: ['client_review', 'cancelled'],
  client_review: ['revisions', 'delivered'],
  revisions: ['client_review', 'in_development'],
  delivered: ['completed', 'revisions'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses that require payment to have cleared. */
export const PAID_STATUSES: ProjectStatus[] = [
  'confirmed', 'requirements_collected', 'in_development', 'client_review', 'revisions', 'delivered', 'completed',
];

export type PaymentStatus = 'unpaid' | 'pending_verification' | 'paid' | 'failed' | 'refunded';

export const PAYMENT_STATUS_BN: Record<PaymentStatus, string> = {
  unpaid: 'পরিশোধ হয়নি',
  pending_verification: 'যাচাইয়ের অপেক্ষায়',
  paid: 'পরিশোধিত',
  failed: 'ব্যর্থ',
  refunded: 'ফেরত দেওয়া হয়েছে',
};

export type PaymentMethod = 'sslcommerz' | 'bkash' | 'nagad' | 'rocket' | 'card' | 'bank_transfer' | 'stripe';

export const PAYMENT_METHOD_BN: Record<PaymentMethod, string> = {
  sslcommerz: 'এসএসএলকমার্জ',
  bkash: 'বিকাশ',
  nagad: 'নগদ',
  rocket: 'রকেট',
  card: 'ভিসা / মাস্টারকার্ড',
  bank_transfer: 'ব্যাংক ট্রান্সফার',
  stripe: 'আন্তর্জাতিক কার্ড',
};

export const LEAD_STATUSES = ['new', 'contacted', 'follow_up', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_BN: Record<LeadStatus, string> = {
  new: 'নতুন',
  contacted: 'যোগাযোগ করা হয়েছে',
  follow_up: 'ফলো-আপ দরকার',
  won: 'অর্ডারে রূপান্তরিত',
  lost: 'হারানো',
};

export const ROLES = ['super_admin', 'sales_support', 'project_manager', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_BN: Record<Role, string> = {
  super_admin: 'সুপার অ্যাডমিন',
  sales_support: 'সেলস / সাপোর্ট',
  project_manager: 'প্রজেক্ট ম্যানেজার',
  viewer: 'শুধু দেখার অনুমতি',
};
