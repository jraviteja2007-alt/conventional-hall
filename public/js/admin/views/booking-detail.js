import { html, setHTML, $, A, load, pageHead, card, kv, ic, badge, money, dShort, t12, fmtDT, can, toast, num, cap, emptyBlock, on } from '../core.js';
import { formModal, promptDialog } from '../forms.js';
import { confirmDialog } from '/js/ui.js';

const PAY_METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['bank_transfer', 'Bank transfer'], ['cheque', 'Cheque'], ['card_machine', 'Card machine']];

export default async function bookingDetail({ el, params }) {
  const ref = params.ref.toUpperCase();
  await load(el, () => A.get(`/api/admin/bookings/${encodeURIComponent(ref)}`), ({ booking: b }, reload) => {
    const mg = can('bookings.manage'); const live = ['pending', 'held', 'reserved', 'confirmed'].includes(b.status);
    const act = (a, label, cls = 'ghost', icon = '') => html`<button class="btn sm ${cls}" type="button" data-a="${a}">${icon ? ic(icon) : ''} ${label}</button>`;
    const actions = html`${mg && b.status === 'pending' ? html`${act('approve', 'Approve', 'good', 'check')}${act('reject', 'Reject', 'danger', 'x')}` : ''}
      ${mg && b.status === 'reserved' ? act('confirm', 'Confirm booking', 'good', 'check') : ''}
      ${mg && live ? act('modify', 'Modify / reschedule', 'ghost', 'edit') : ''}
      ${mg && live ? act('cancel', 'Cancel booking', 'danger', 'ban') : ''}
      ${can('payments.manage') && b.balance > 0 && !['cancelled', 'rejected', 'expired'].includes(b.status) ? act('pay', 'Record payment', 'ghost', 'rupee') : ''}
      ${can('payments.manage') ? act('invoice', 'Generate invoice', 'ghost', 'doc') : ''}
      <a class="btn sm ghost" href="/api/bookings/${b.ref}/confirmation.pdf" target="_blank" rel="noopener">${ic('pdf')} Confirmation</a>
      <a class="btn sm ghost" href="/api/bookings/${b.ref}/invoice.pdf" target="_blank" rel="noopener">${ic('pdf')} Invoice</a>`;
    const lines = b.price_breakdown?.lines || [];
    setHTML(el, html`${pageHead({ title: html`${b.ref} ${badge(b.status)}`, sub: `${b.event?.name || 'Event'}${b.event_title ? ` · ${b.event_title}` : ''} · created ${fmtDT(b.created_at)}`, actions })}
      <div class="split"><div class="stack">
        ${card('Event', kv([['Date', dShort(b.event_date)], ['Time', `${t12(b.start_time)} – ${t12(b.end_time)}`], ['Hall', b.hall?.name], ['Guests', num(b.guests)], ['Package', b.package?.name || 'Hall only'], ['Requirements', b.requirements]]))}
        ${card('Customer', kv([['Name', b.customer_name], ['Phone', html`<a href="tel:${b.phone}">${b.phone}</a>`], ['Email', html`<a href="mailto:${b.email}">${b.email}</a>`]]))}
        ${card('Price breakdown', lines.length ? html`<div class="tbl-wrap"><table class="tbl"><tbody>${lines.map((l) => html`<tr><td>${l.label}${l.qty > 1 ? html` <span class="muted small">(${num(l.qty)} × ${money(l.unit)})</span>` : ''}</td><td class="right">${l.included ? 'Included' : money(l.amount)}</td></tr>`)}
          <tr><td><b>Subtotal</b></td><td class="right">${money(b.subtotal)}</td></tr>${b.discount ? html`<tr><td>Discount</td><td class="right">− ${money(b.discount)}</td></tr>` : ''}<tr><td>Tax</td><td class="right">${money(b.tax)}</td></tr>
          <tr><td><b>Total</b></td><td class="right"><b>${money(b.total)}</b></td></tr></tbody></table></div>` : html`<p class="muted">Total ${money(b.total)}</p>`)}
        ${card('Payments', html`${kv([['Total', money(b.total)], ['Advance required', money(b.advance_required)], ['Paid', money(b.paid)], ['Balance', money(b.balance)]])}
          ${b.payments.length ? html`<div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Receipt</th><th>Method</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead><tbody>${b.payments.map((p) => html`<tr><td>${p.receipt_no || '—'}<div class="cell-sub">${fmtDT(p.verified_at || p.created_at)}</div></td><td>${cap(p.method || p.gateway)}</td><td class="right">${money(p.amount)}</td><td>${badge(p.status)}</td><td class="act">${can('payments.view') && p.receipt_no ? html`<a class="btn sm ghost" href="/api/admin/payments/${p.id}/receipt.pdf" target="_blank" rel="noopener">${ic('pdf')}</a>` : ''}</td></tr>`)}</tbody></table></div>` : html`<p class="muted" style="margin-top:12px">No payments yet.</p>`}
          ${b.refunds?.length ? html`<h3 style="margin:16px 0 6px">Refunds</h3>${b.refunds.map((r) => html`<div class="row between"><span>${money(r.amount)} ${r.reason ? html`<span class="muted small">· ${r.reason}</span>` : ''}</span>${badge(r.status)}</div>`)}` : ''}`)}
      </div><div class="stack">
        ${card('Internal notes', html`<form id="noteForm"><div class="field"><label for="nt" class="sr-only">Internal notes</label><textarea id="nt" rows="5" maxlength="2000" ${can('bookings.note') ? '' : 'disabled'}>${b.admin_notes || ''}</textarea></div>${can('bookings.note') ? html`<button class="btn sm" style="margin-top:10px" type="submit">Save note</button>` : ''}</form>`)}
        ${card('Services', b.services.length ? html`<ul class="timeline">${b.services.map((s) => html`<li>${s.name} <span class="muted">× ${s.quantity}</span> — ${s.included ? 'Included' : money(s.amount)}</li>`)}</ul>` : html`<p class="muted">No add-on services.</p>`)}
        ${card('Activity', b.audit?.length ? html`<ul class="timeline">${b.audit.map((a) => html`<li><b>${a.action}</b> <span class="muted">by ${a.actor_name || 'system'} · ${fmtDT(a.created_at)}</span></li>`)}</ul>` : emptyBlock('No activity yet'))}
      </div></div>`);
    const done = (msg) => { toast(msg, 'ok'); window.dispatchEvent(new Event('actions:changed')); reload(); };
    $('#noteForm', el)?.addEventListener('submit', async (e) => { e.preventDefault(); try { await A.post(`/api/admin/bookings/${b.ref}/notes`, { notes: $('#nt', el).value }); toast('Note saved', 'ok'); } catch (err) { toast(err.message, 'err'); } });
    on(el, 'click', '[data-a]', async (e, btn) => {
      const a = btn.dataset.a; const u = `/api/admin/bookings/${b.ref}`;
      try {
        if (a === 'approve' && await confirmDialog(`Approve ${b.ref}? The customer will be asked to pay the advance of ${money(b.advance_required)}.`, { ok: 'Approve' })) { await A.post(`${u}/approve`); done('Booking approved'); }
        else if (a === 'confirm' && await confirmDialog(`Confirm ${b.ref} without waiting for the advance payment?`, { ok: 'Confirm' })) { await A.post(`${u}/confirm`); done('Booking confirmed'); }
        else if (a === 'reject') { const r = await promptDialog({ title: 'Reject booking', label: 'Reason (shown to the customer)', ok: 'Reject', danger: true }); if (r !== null) { await A.post(`${u}/reject`, { reason: r || undefined }); done('Booking rejected'); } }
        else if (a === 'cancel') {
          formModal({ title: `Cancel ${b.ref}`, danger: true, submit: 'Cancel booking', intro: html`<p class="full">Under the cancellation policy the refund would be <b>${money(b.policy?.refundIfCancelledNow ?? 0)}</b>. Leave the override empty to apply the policy.</p>`,
            fields: [{ name: 'reason', label: 'Reason', type: 'textarea' }, { name: 'refundPct', label: 'Refund % override (0-100)', type: 'number', min: 0, max: 100 }],
            onSave: async (v) => { await A.post(`${u}/cancel`, v); done('Booking cancelled'); } });
        } else if (a === 'modify') {
          formModal({ title: `Modify ${b.ref}`, submit: 'Save changes', values: { date: b.event_date, start: b.start_time, end: b.end_time, guests: b.guests, requirements: b.requirements },
            fields: [{ name: 'date', label: 'Event date', type: 'date', required: true }, { name: 'guests', label: 'Guests', type: 'number', min: 1 }, { name: 'start', label: 'Start', type: 'time' }, { name: 'end', label: 'End', type: 'time' }, { name: 'requirements', label: 'Requirements', type: 'textarea' }, { name: 'keepPrice', label: 'Keep the original price', type: 'checkbox', full: true }],
            onSave: async (v) => { await A.patch(u, v); done('Booking updated'); } });
        } else if (a === 'pay') {
          formModal({ title: 'Record payment', submit: 'Record', values: { amount: b.balance, method: 'cash' }, intro: html`<p class="full muted">Balance due: ${money(b.balance)}</p>`,
            fields: [{ name: 'amount', label: 'Amount (₹)', type: 'number', min: 1, required: true }, { name: 'method', label: 'Method', type: 'select', options: PAY_METHODS }, { name: 'notes', label: 'Reference / notes', type: 'text', full: true }],
            onSave: async (v) => { await A.post(`${u}/payments`, v); done('Payment recorded'); } });
        } else if (a === 'invoice') { const r = await A.post(`${u}/invoice`); toast(`Invoice ${r.invoice?.invoice_no || ''} ready`, 'ok'); window.open(`/api/bookings/${b.ref}/invoice.pdf`, '_blank', 'noopener'); }
      } catch (err) { toast(err.message, 'err'); }
    });
  });
}
