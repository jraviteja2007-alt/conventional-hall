import { html, setHTML, $, A, pageHead, ic, badge, cell, money, dShort, can, toast, kv, fmtDT, yesNo, link } from '../core.js';
import { mountTable } from '../table.js';
import { formModal, secretDialog } from '../forms.js';
import { confirmDialog, modal } from '/js/ui.js';

const FIELDS = [{ name: 'name', label: 'Full name', required: true }, { name: 'phone', label: 'Phone', type: 'tel', required: true }, { name: 'organization', label: 'Organisation' }, { name: 'notes', label: 'Notes', type: 'textarea' }];
export default async function customers({ el }) {
  setHTML(el, html`${pageHead({ title: 'Customers', sub: 'Everyone who has registered or booked.', actions: can('customers.manage') ? html`<button class="btn" id="addc" type="button">${ic('plus')} Add customer</button>` : '' })}<section class="card flush" id="tb"></section>`);
  let t;
  $('#addc', el)?.addEventListener('click', () => formModal({ title: 'Add customer', submit: 'Create', fields: [{ name: 'email', label: 'Email', type: 'email', required: true }, ...FIELDS],
    onSave: async (v) => { const r = await A.post('/api/admin/customers', v); toast('Customer created', 'ok'); t.reload(); secretDialog('Temporary password', `Share this with ${v.name} so they can sign in.`, 'Password', r.temporaryPassword); } }));
  const open = async (c) => {
    const { customer: u, bookings } = await A.get(`/api/admin/customers/${c.id}`);
    const body = document.createElement('div');
    setHTML(body, html`${kv([['Email', u.email], ['Phone', u.phone], ['Organisation', u.organization], ['Joined', fmtDT(u.created_at)], ['Last sign-in', fmtDT(u.last_login_at)], ['Status', yesNo(u.is_active)]])}
      <h3 style="margin:18px 0 8px">Bookings (${bookings.length})</h3>${bookings.length ? html`<div class="tbl-wrap"><table class="tbl"><tbody>${bookings.map((b) => html`<tr><td><a href="/admin/bookings/${b.ref}" data-link>${b.ref}</a></td><td>${dShort(b.event_date)}</td><td class="right">${money(b.total)}</td><td>${badge(b.status)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No bookings yet.</p>`}`);
    const m = modal({ title: u.name, body, wide: true, actions: [{ label: 'Close', cls: 'ghost' }] });
    body.addEventListener('click', (e) => { if (e.target.closest('a[data-link]')) m.close(true); });
  };
  t = mountTable($('#tb', el), {
    exportName: 'customers', exportUrl: (p) => `/api/admin/export/customers?format=${p.format}`, searchPlaceholder: 'Name, email or phone',
    load: (p) => A.get(`/api/admin/customers${A.qs(p)}`), onRow: open, empty: { title: 'No customers yet', text: 'Customers appear when they register or book online.' },
    onAction: async (a, r, reload) => {
      try {
        if (a === 'edit') formModal({ title: 'Edit customer', values: r, fields: FIELDS, onSave: async (v) => { await A.put(`/api/admin/customers/${r.id}`, v); toast('Saved', 'ok'); reload(); } });
        else if (a === 'toggle') { await A.put(`/api/admin/customers/${r.id}`, { is_active: !r.is_active }); toast(r.is_active ? 'Account disabled' : 'Account enabled', 'ok'); reload(); }
        else if (a === 'reset' && await confirmDialog(`Reset the password for ${r.name}? Their current sessions will be signed out.`, { ok: 'Reset' })) { const x = await A.post(`/api/admin/customers/${r.id}/reset-password`); secretDialog('Temporary password', `New password for ${r.name}:`, 'Password', x.temporaryPassword); }
        else if (a === 'del' && await confirmDialog(`Delete ${r.name}? Their booking history is kept without the account link.`, { ok: 'Delete', danger: true })) { await A.del(`/api/admin/customers/${r.id}`); toast('Customer deleted', 'ok'); reload(); }
      } catch (e) { toast(e.message, 'err'); }
    },
    columns: [
      { key: 'name', label: 'Customer', render: (r) => cell(r.name, r.organization || r.email) }, { key: 'phone', label: 'Phone' },
      { key: 'bookings', label: 'Bookings', cls: 'right' }, { key: 'spent', label: 'Paid', cls: 'right', render: (r) => money(r.spent) },
      { key: 'is_active', label: 'Status', render: (r) => yesNo(r.is_active) },
      { key: 'act', label: '', cls: 'act', render: (r) => can('customers.manage') ? html`<button class="btn sm ghost" data-act="edit" type="button" aria-label="Edit ${r.name}">${ic('edit')}</button> <button class="btn sm ghost" data-act="toggle" type="button">${r.is_active ? 'Disable' : 'Enable'}</button> <button class="btn sm ghost" data-act="reset" type="button" aria-label="Reset password">${ic('key')}</button>${can('customers.delete') ? html` <button class="btn sm danger" data-act="del" type="button" aria-label="Delete ${r.name}">${ic('trash')}</button>` : ''}` : '' },
    ],
  });
}
