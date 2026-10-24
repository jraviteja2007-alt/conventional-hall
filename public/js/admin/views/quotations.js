import { html, setHTML, $, A, pageHead, ic, badge, cell, money, dShort, can, toast } from '../core.js';
import { mountTable } from '../table.js';
import { formModal } from '../forms.js';
import { confirmDialog } from '/js/ui.js';

const toLines = (items) => (items || []).map((i) => `${i.label} | ${i.qty} | ${i.unit}`);
const parseLines = (lines) => lines.map((s) => { const [label, qty, unit] = s.split('|').map((x) => x.trim()); return { label, qty: Number(qty) || 1, unit: Number(unit) || 0 }; });
export default async function quotations({ el }) {
  const halls = (await A.get('/api/halls')).halls; let t;
  setHTML(el, html`${pageHead({ title: 'Quotations', sub: 'Custom pricing for large or unusual events. Totals include tax automatically.', actions: html`<button class="btn" id="add" type="button">${ic('plus')} New quotation</button>` })}<section class="card flush" id="tb"></section>`);
  const fields = [{ name: 'customer_name', label: 'Customer name', required: true }, { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'hall_id', label: 'Hall', type: 'select', options: [['', '—'], ...halls.map((h) => [h.id, h.name])] },
    { name: 'event_title', label: 'Event' }, { name: 'event_date', label: 'Event date', type: 'date' }, { name: 'guests', label: 'Guests', type: 'number', min: 1 }, { name: 'valid_until', label: 'Valid until', type: 'date' },
    { name: 'items', label: 'Line items — one per line: description | quantity | unit price (₹)', type: 'lines', rows: 6, required: true, placeholder: 'Hall rental (full day) | 1 | 130000' }, { name: 'discount', label: 'Discount (₹)', type: 'number', min: 0 },
    { name: 'status', label: 'Status', type: 'select', options: ['draft', 'sent', 'accepted', 'expired', 'rejected'].map((s) => [s, s[0].toUpperCase() + s.slice(1)]) }, { name: 'notes', label: 'Notes / terms', type: 'textarea' }];
  const prep = (v) => { const b = { ...v, items: parseLines(v.items || []) }; if (b.hall_id) b.hall_id = Number(b.hall_id); else delete b.hall_id; return b; };
  const open = (r) => formModal({ title: r ? `Edit ${r.quote_no}` : 'New quotation', wide: true, fields, values: r ? { ...r, items: toLines(r.items) } : { status: 'draft' }, submit: r ? 'Save' : 'Create',
    onSave: async (v) => { const b = prep(v); const res = r ? await A.put(`/api/admin/quotations/${r.id}`, b) : await A.post('/api/admin/quotations', b); toast(`Saved — total ${money(res.total)}`, 'ok'); t.reload(); } });
  $('#add', el).addEventListener('click', () => open(null));
  t = mountTable($('#tb', el), {
    exportName: 'quotations', searchPlaceholder: 'Quote number or customer', fetchAll: async () => (await A.get('/api/admin/quotations')).rows, empty: { title: 'No quotations yet', text: 'Create one from an enquiry or phone call.' },
    onRow: open,
    onAction: async (a, r, reload) => { if (a === 'del' && await confirmDialog(`Delete ${r.quote_no}?`, { ok: 'Delete', danger: true })) { try { await A.del(`/api/admin/quotations/${r.id}`); toast('Deleted', 'ok'); reload(); } catch (e) { toast(e.message, 'err'); } } },
    columns: [{ key: 'quote_no', label: 'Quote', render: (r) => cell(r.quote_no, dShort(r.created_at)) }, { key: 'customer_name', label: 'Customer', render: (r) => cell(r.customer_name, r.phone) }, { key: 'event_title', label: 'Event', render: (r) => cell(r.event_title || '—', r.event_date ? dShort(r.event_date) : '') },
      { key: 'total', label: 'Total', cls: 'right', render: (r) => money(r.total) }, { key: 'status', label: 'Status', render: (r) => badge(r.status) },
      { key: 'act', label: '', sort: false, cls: 'act', render: (r) => html`<a class="btn sm ghost" href="/api/admin/quotations/${r.id}/pdf" target="_blank" rel="noopener" aria-label="PDF for ${r.quote_no}">${ic('pdf')} PDF</a> <button class="btn sm danger" data-act="del" type="button" aria-label="Delete ${r.quote_no}">${ic('trash')}</button>` }],
  });
}
