import { run } from '../db.js';
export function audit(req, action, entity, entityId, detail) {
  const u = req?.user;
  try {
    run('INSERT INTO audit_logs(user_id,user_label,action,entity,entity_id,detail,ip) VALUES (?,?,?,?,?,?,?)',
      u?.id ?? null, u ? `${u.name} <${u.email}>` : 'system', action, entity ?? null, entityId != null ? String(entityId) : null,
      detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1500) : null, req?.ip ?? null);
  } catch { /* auditing must never break the request */ }
}
