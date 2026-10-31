import type { Env } from '../env';

export async function audit(
  env: Env,
  adminId: number | null,
  action: string,
  entity: string,
  entityId: string | number | null,
  details: Record<string, unknown> = {},
  ip = '',
): Promise<void> {
  // Never log secrets or passwords.
  const clean = JSON.parse(JSON.stringify(details, (k, v) => (/(password|secret|token|key)$/i.test(k) ? '[redacted]' : v)));
  await env.DB.prepare('INSERT INTO activity_log (admin_id, action, entity, entity_id, details, ip) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(adminId, action, entity, entityId === null ? null : String(entityId), JSON.stringify(clean).slice(0, 4000), ip)
    .run();
}

export async function notifyAdmins(env: Env, type: string, title: string, link = ''): Promise<void> {
  await env.DB.prepare('INSERT INTO admin_notifications (type, title, link) VALUES (?, ?, ?)').bind(type, title, link).run();
}
