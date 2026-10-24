import { html, setHTML, $, $$, A, pageHead, ic, badge, cell, money, fmtDT, can, toast, cap, on } from '../core.js';
import { mountTable } from '../table.js';
import { confirmDialog } from '/js/ui.js';

export default async function payments({ el, query }) {
  setHTML(el, html`${pageHead({ title: 'Payments & refunds', sub: 'Every receipt, and refund requests awaiting your decision.' })}
    <div class="tabs" role="tablist" aria-label="Payments"><button role="tab" type="button" data-t="p" aria-selected="true">Payments</button><button role="tab" type="button" data-t="r" aria-selected="false">Refunds</button></div><section class="card flush" id="tb"></section>`);
  const host = $('#tb', el); let tab = query.tab === 'refunds' ? 'r' : 'p';
  const show = () => {
    $$('[data-t]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
    if (tab === 'p') mountTable(host, {
      exportName: 'payments', exportUrl: (p) => `/api/admin/export/payments?format=${p.format}`, search: false, pageSize: 15,
      filters: [{ name: 'status', label: 'Status', options: ['paid', 'created', 'failed', 'refunded', 'partially_refunded'].map((s) => [s, cap(s)]) }, { name: 'from', label: 'From', type: 'date' }, { name: 'to', label: 'To', type: 'date' }],
      load: (p) => A.get(`/api/admin/payments${A.qs(p)}`), empty: { title: 'No payments found' },
      columns: [{ key: 'receipt_no', label: 'Receipt', render: (r) => cell(r.receipt_no || '—', fmtDT(r.verified_at || r.created_at)) }, { key: 'ref', label: 'Booking', render: (r) => cell(html`<a href="/admin/bookings/${r.ref}" data-link>${r.ref}</a>`, r.customer_name) },
        { key: 'purpose', label: 'Purpose', render: (r) => cell(cap(r.purpose), cap(r.method || r.gateway)) }, { key: 'amount', label: 'Amount', cls: 'right', render: (r) => cell(money(r.amount), r.refunded_amount ? `Refunded ${money(r.refunded_amount)}` : '') }, { key: 'status', label: 'Status', render: (r) => badge(r.status) },
        { key: 'pdf', label: '', cls: 'act', render: (r) => (r.receipt_no ? html`<a class="btn sm ghost" href="/api/admin/payments/${r.id}/receipt.pdf" target="_blank" rel="noopener" aria-label="Receipt PDF">${ic('pdf')}</a>` : '') }],
    });
    else mountTable(host, {
      exportName: 'refunds', fetchAll: async () => (await A.get('/api/admin/refunds')).rows, empty: { title: 'No refunds', text: 'Refund records appear when bookings are cancelled.' },
      filters: [{ name: 'status', label: 'Status', options: ['requested', 'approved', 'processed', 'rejected'].map((s) => [s, cap(s)]) }],
      onAction: async (a, r, reload) => { if (!can('refunds.manage')) return; if (await confirmDialog(`${cap(a)} refund of ${money(r.amount)} for ${r.ref}?`, { ok: cap(a), danger: a === 'rejected' })) { try { await A.put(`/api/admin/refunds/${r.id}`, { status: a }); toast('Refund updated', 'ok'); window.dispatchEvent(new Event('actions:changed')); reload(); } catch (e) { toast(e.message, 'err'); } } },
      columns: [{ key: 'ref', label: 'Booking', render: (r) => cell(html`<a href="/admin/bookings/${r.ref}" data-link>${r.ref}</a>`, r.customer_name) }, { key: 'amount', label: 'Amount', cls: 'right', render: (r) => money(r.amount) }, { key: 'reason', label: 'Reason' }, { key: 'created_at', label: 'Requested', render: (r) => fmtDT(r.created_at) }, { key: 'status', label: 'Status', render: (r) => badge(r.status) },
        { key: 'act', label: '', sort: false, cls: 'act', render: (r) => (can('refunds.manage') ? html`${r.status === 'requested' ? html`<button class="btn sm good" data-act="approved" type="button">Approve</button> ` : ''}${['requested', 'approved'].includes(r.status) ? html`<button class="btn sm ghost" data-act="processed" type="button">Mark processed</button> <button class="btn sm danger" data-act="rejected" type="button">Reject</button>` : ''}` : '') }],
    });
  };
  on(el, 'click', '[data-t]', (e, b) => { tab = b.dataset.t; show(); });
  show();
}
