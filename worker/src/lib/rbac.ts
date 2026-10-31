import type { Role } from '../../../shared/status';

/** Permission → roles allowed. Read access for every admin screen is granted to all roles. */
export const PERMISSIONS = {
  'catalog.write': ['super_admin', 'sales_support'],
  'marketing.write': ['super_admin', 'sales_support'],
  'orders.write': ['super_admin', 'sales_support', 'project_manager'],
  'orders.payment': ['super_admin', 'sales_support'],
  'orders.delete': ['super_admin'],
  'requirements.read': ['super_admin', 'sales_support', 'project_manager'],
  'leads.write': ['super_admin', 'sales_support'],
  'reviews.write': ['super_admin', 'sales_support'],
  'chat.write': ['super_admin', 'sales_support'],
  'ai.use': ['super_admin', 'sales_support', 'project_manager'],
  'ai.configure': ['super_admin'],
  'settings.write': ['super_admin'],
  'staff.write': ['super_admin'],
  'audit.read': ['super_admin'],
  'export': ['super_admin', 'sales_support', 'project_manager'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
