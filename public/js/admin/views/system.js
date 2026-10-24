// System views: notification log, staff accounts & roles, audit log, backup & export.
import { html, setHTML, $, A, load, pageHead, card, ic, badge, cell, fmtDT, can, toast, cap, ROLE_LABEL, state, yesNo, on } from '../core.js';
import { mountTable } from '../table.js';
import { formModal, secretDialog } from '../forms.js';

const ROLES = [['staff', 'Staff'], ['manager', 'Manager'], ['admin', 'Admin'], ['super_admin', 'Super admin']];

function notifications(el) {
  setHTML(el, html`${pageHead({ title: 'Notification log', sub: 'Email, SMS and WhatsApp messages queued by the system.', actions: html`<button class="btn" id="fl" type="button">${ic('refresh')} Send queued now</button>` })}<section class="card flush" id="tb"></section>`);
  const t = mountTable($('#tb', el), { exportName: 'notifications', searchPlaceholder: 'Recipient or type', fetchAll: async () => (await A.get('/api/admin/notification-log')).rows, empty: { title: 'Nothing sent yet' },
    filters: [{ name: 'status', label: 'Status', options: [['queued', 'Queued'], ['sent', 'Sent'], ['failed', 'Failed']] }, { name: 'channel', label: 'Channel', options: [['email', 'Email'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']] }],
    columns: [{ key: 'created_at', label: 'When', render: (r) => fmtDT(r.created_at) }, { key: 'channel', label: 'Channel', render: (r) => cap(r.channel) }, { key: 'type', label: 'Type', render: (r) => cap(r.type) }, { key: 'recipient', label: 'Recipient' }, { key: 'status', label: 'Status', render: (r) => cell(badge(r.status), r.error || (r.provider ? `via ${r.provider}` : '')) }, { key: 'attempts', label: 'Tries', cls: 'right' }] });
  $('#fl', el).addEventListener('click', async (e) => { e.currentTarget.classList.add('is-loading'); try { const r = await A.post('/api/admin/notification-log/flush'); toast(`${r.processed} message(s) processed`, 'ok'); t.reload(); } catch (err) { toast(err.message, 'err'); } finally { e.currentTarget?.classList.remove('is-loading'); } });
}

function users(el) {
  setHTML(el, html`${pageHead({ title: 'Staff accounts', sub: 'Who can sign in to this console, and what they can do.', actions: html`<button class="btn" id="au" type="button">${ic('plus')} Add staff user</button>` })}<section class="card flush" id="tb"></section>`);
  let t;
  $('#au', el).addEventListener('click', () => formModal({ title: 'Add staff user', submit: 'Create', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'role', label: 'Role', type: 'select', options: ROLES, help: 'Staff: view & notes · Manager: manage bookings/payments · Admin: catalogue & settings · Super admin: everything.' }],
    onSave: async (v) => { const r = await A.post('/api/admin/users', v); toast('User created', 'ok'); t.reload(); secretDialog('Temporary password', `Give this to ${v.name}; they should change it after signing in.`, 'Password', r.temporaryPassword); } }));
  t = mountTable($('#tb', el), { exportName: 'staff-users', fetchAll: async () => (await A.get('/api/admin/users')).rows,
    onAction: async (a, r, reload) => {
      if (a === 'role') formModal({ title: `Change role: ${r.name}`, values: { role: r.role }, fields: [{ name: 'role', label: 'Role', type: 'select', options: [['customer', 'Customer (no console access)'], ...ROLES] }], onSave: async (v) => { await A.put(`/api/admin/users/${r.id}`, v); toast('Role updated', 'ok'); reload(); } });
      else if (a === 'toggle') { try { await A.put(`/api/admin/users/${r.id}`, { is_active: !r.is_active }); toast(r.is_active ? 'User disabled' : 'User enabled', 'ok'); reload(); } catch (e) { toast(e.message, 'err'); } }
    },
    columns: [{ key: 'name', label: 'User', render: (r) => cell(r.name, r.email) }, { key: 'role', label: 'Role', render: (r) => badge('active', ROLE_LABEL[r.role] || r.role) }, { key: 'last_login_at', label: 'Last sign-in', render: (r) => fmtDT(r.last_login_at) || 'Never' }, { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) },
      { key: 'act', label: '', sort: false, cls: 'act', render: (r) => (r.id === state.user.id ? html`<span class="muted small">You</span>` : html`<button class="btn sm ghost" data-act="role" type="button">Change role</button> <button class="btn sm ghost" data-act="toggle" type="button">${r.is_active ? 'Disable' : 'Enable'}</button>`) }] });
}

function audit(el) {
  setHTML(el, html`${pageHead({ title: 'Audit log', sub: 'A record of important actions taken by staff and the system.' })}<section class="card flush" id="tb"></section>`);
  mountTable($('#tb', el), { exportName: 'audit-log', pageSize: 25, searchPlaceholder: 'Action, entity or person', load: (p) => A.get(`/api/admin/audit${A.qs(p)}`), empty: { title: 'No activity recorded yet' },
    columns: [{ key: 'created_at', label: 'When', render: (r) => fmtDT(r.created_at) }, { key: 'actor_name', label: 'Who', render: (r) => r.actor_name || 'System' }, { key: 'action', label: 'Action', render: (r) => html`<code>${r.action}</code>` }, { key: 'entity', label: 'Entity', render: (r) => cell(r.entity, r.entity_id) }, { key: 'ip', label: 'IP' }] });
}

function backup(el) {
  const dl = (href, icon, title, text) => html`<a class="card" href="${href}" style="display:block;padding:20px;color:inherit"><div class="chip-ic" style="width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:rgba(201,162,75,.14);color:var(--brand);margin-bottom:10px">${ic(icon)}</div><b>${title}</b><p class="muted small" style="margin:6px 0 0">${text}</p></a>`;
  setHTML(el, html`${pageHead({ title: 'Backup & export', sub: 'Download your data. Store backups somewhere safe and test restoring them.' })}
    <div class="grid g3" style="margin-bottom:18px">${dl('/api/admin/backup/database', 'db', 'Database snapshot (.db)', 'A consistent copy of the whole SQLite database. Restore by replacing the file while the server is stopped.')}${dl('/api/admin/backup/export.json', 'download', 'Full JSON export', 'All business tables as JSON (password hashes are never included).')}</div>
    ${card('Spreadsheet exports', html`<div class="row">${['bookings', 'payments', 'customers', 'enquiries'].map((x) => html`<a class="btn ghost" href="/api/admin/export/${x}?format=csv">${ic('download')} ${cap(x)} CSV</a><a class="btn ghost" href="/api/admin/export/${x}?format=xls">${cap(x)} Excel</a>`)}</div>`)}
    ${card('Recovery procedure', html`<ol><li>Stop the server.</li><li>Replace <code>data/convention.db</code> (and delete the <code>-wal</code>/<code>-shm</code> files) with your latest snapshot.</li><li>Start the server and check the dashboard totals.</li><li>Uploaded images live in <code>uploads/</code> — back that folder up too.</li></ol><p class="muted small">Full instructions are in the project documentation.</p>`, { cls: 'x' })}`);
}

export default async function system({ el, entity }) { ({ notifications, users, audit, backup })[entity](el); }
