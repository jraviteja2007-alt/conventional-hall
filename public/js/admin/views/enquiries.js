import { html, setHTML, $, A, load, pageHead, ic, badge, kv, dShort, fmtDT, can, toast, ago, cap, on, emptyBlock } from '../core.js';
import { formModal } from '../forms.js';
import { confirmDialog } from '/js/ui.js';

const LANES = [['new', 'New'], ['contacted', 'Contacted'], ['follow_up', 'Follow-up'], ['converted', 'Converted'], ['closed', 'Closed']];
export default async function enquiries({ el }) {
  await load(el, () => A.get('/api/admin/enquiries?pageSize=100'), ({ rows, total }, reload) => {
    setHTML(el, html`${pageHead({ title: 'Enquiries', sub: `${total} enquiries · move each lead through the pipeline.`, actions: html`<a class="btn ghost" href="/api/admin/export/enquiries?format=csv">${ic('download')} CSV</a>` })}
      ${rows.length ? html`<div class="pipe" role="list">${LANES.map(([k, l]) => { const items = rows.filter((r) => r.status === k); return html`<section class="lane" role="listitem" aria-label="${l}"><h3>${l}<span>${items.length}</span></h3>${items.map((r) => html`<button type="button" class="enq" data-id="${r.id}"><b>${r.name}</b><div class="muted small">${r.event_type || 'Enquiry'}${r.event_date ? ` · ${dShort(r.event_date)}` : ''}${r.guests ? ` · ${r.guests} guests` : ''}</div><div class="small" style="margin-top:4px">${(r.message || '').slice(0, 80)}</div><div class="muted small" style="margin-top:6px">${ago(r.created_at)}</div></button>`)}</section>`; })}</div>` : emptyBlock('No enquiries yet', 'They arrive from the website enquiry and contact forms.')}`);
    on(el, 'click', '.enq', (e, b) => {
      const r = rows.find((x) => x.id === Number(b.dataset.id));
      formModal({ title: `${r.name} · ${r.phone}`, wide: true, submit: 'Save', values: { status: r.status, follow_up_at: r.follow_up_at || '', notes: r.notes || '', booking_ref: '' },
        intro: html`<div class="full">${kv([['Phone', html`<a href="tel:${r.phone}">${r.phone}</a>`], ['Email', r.email], ['Event', r.event_type], ['Date', dShort(r.event_date)], ['Guests', r.guests], ['Source', cap(r.source)], ['Received', fmtDT(r.created_at)]])}<p style="margin-top:12px"><b>Message</b><br>${r.message || '—'}</p></div>`,
        fields: [{ name: 'status', label: 'Status', type: 'select', options: LANES }, { name: 'follow_up_at', label: 'Follow-up date', type: 'date' }, { name: 'booking_ref', label: 'Link to booking ref (when converted)' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
        extra: can('customers.delete') ? html`<div class="full"><button class="btn sm danger" type="button" data-del-enq>${ic('trash')} Delete enquiry</button></div>` : '',
        onOpen: (form, m) => form.querySelector('[data-del-enq]')?.addEventListener('click', async () => { if (await confirmDialog('Delete this enquiry permanently?', { ok: 'Delete', danger: true })) { await A.del(`/api/admin/enquiries/${r.id}`); m.close(true); toast('Deleted', 'ok'); window.dispatchEvent(new Event('actions:changed')); reload(); } }),
        onSave: async (v) => { await A.put(`/api/admin/enquiries/${r.id}`, v); toast('Enquiry updated', 'ok'); window.dispatchEvent(new Event('actions:changed')); reload(); } });
    });
  });
}
