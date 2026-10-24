import { html, setHTML, $, $$, A, pageHead, ic, badge, cell, fmtDT, can, toast, on } from '../core.js';
import { mountTable } from '../table.js';
import { confirmDialog } from '/js/ui.js';

export default async function reviews({ el }) {
  setHTML(el, html`${pageHead({ title: 'Reviews', sub: 'Reviews only appear on the website after you approve them.' })}<section class="card flush" id="tb"></section>`);
  mountTable($('#tb', el), {
    exportName: 'reviews', searchPlaceholder: 'Author or text', fetchAll: async () => (await A.get('/api/admin/reviews')).rows, empty: { title: 'No reviews yet', text: 'Customers can review after their event.' },
    filters: [{ name: 'status', label: 'Status', options: [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']] }],
    onAction: async (a, r, reload) => {
      try {
        if (a === 'del') { if (!(await confirmDialog('Delete this review permanently?', { ok: 'Delete', danger: true }))) return; await A.del(`/api/admin/reviews/${r.id}`); } else await A.put(`/api/admin/reviews/${r.id}`, { status: a });
        toast('Review updated', 'ok'); window.dispatchEvent(new Event('actions:changed')); reload();
      } catch (e) { toast(e.message, 'err'); }
    },
    columns: [{ key: 'author_name', label: 'Author', render: (r) => cell(r.author_name, `${r.event_label || ''}${r.is_sample ? ' · sample' : ''}`) }, { key: 'rating', label: 'Rating', render: (r) => `${r.rating} ★` },
      { key: 'body', label: 'Review', render: (r) => cell(r.title || '', (r.body || '').slice(0, 140)) }, { key: 'created_at', label: 'Date', render: (r) => fmtDT(r.created_at) }, { key: 'status', label: 'Status', render: (r) => badge(r.status) },
      { key: 'act', label: '', sort: false, cls: 'act', render: (r) => (can('reviews.moderate') ? html`${r.status !== 'approved' ? html`<button class="btn sm good" data-act="approved" type="button">Approve</button> ` : ''}${r.status !== 'rejected' ? html`<button class="btn sm ghost" data-act="rejected" type="button">Reject</button> ` : ''}<button class="btn sm danger" data-act="del" type="button" aria-label="Delete review">${ic('trash')}</button>` : '') }],
  });
}
