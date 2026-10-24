// Single booking: status, payments, documents, change/cancel, PDFs and review.
import { html, setHTML, $, $$, icon, inr, num, fmtDate, fmtTime, fmtDT, toast, errorState, confirmDialog, showFieldErrors, formData, todayISO, cap } from '../ui.js';
import { S } from '../store.js';
import { get, post, patch, api } from '../api.js';
import { pageHero, priceBreakdown } from '../components.js';
import { statusBadge } from '../helpers.js';

export default async function booking(ctx) {
  if (!ctx.params.ref) { ctx.navigate('/account', { replace: true }); return; }
  if (!S.user) { ctx.navigate(`/login?next=${encodeURIComponent(ctx.path)}`, { replace: true }); return; }
  const id = encodeURIComponent(ctx.params.ref);
  async function render() {
    let d;
    try { d = await get(`/api/bookings/${id}`); } catch (e) { setHTML(ctx.el, html`${pageHero({ title: 'Booking', crumbs: [{ label: 'My bookings', href: '/account' }, { label: 'Booking' }] })}<div class="container section">${errorState(e.message)}</div>`); return; }
    if (!ctx.isCurrent()) return;
    const b = d.booking; ctx.meta(`Booking ${b.ref}`, 'Your booking details.');
    const advDue = Math.max(0, b.advance_due - b.paid_amount); const open = ['pending', 'reserved', 'confirmed'].includes(b.status);
    const past = b.event_date < todayISO(); const canReview = ['confirmed', 'completed'].includes(b.status) && past;
    const bd = b.breakdown ? { lines: b.breakdown.lines || [], subtotal: b.subtotal, discount: b.discount ? { label: b.coupon_code ? `Coupon ${b.coupon_code}` : 'Discount', code: b.coupon_code || '', amount: b.discount, auto: true } : null, tax: { name: b.breakdown.tax_label || 'GST', rate: b.breakdown.tax_percent || 18, amount: b.tax, cgst: Math.round(b.tax / 2), sgst: b.tax - Math.round(b.tax / 2) }, total: b.total, advancePct: b.breakdown.advance_percent || 30, advance: b.advance_due } : null;
    setHTML(ctx.el, html`
    ${pageHero({ title: `Booking ${b.ref}`, sub: `${b.hall_name} · ${fmtDate(b.event_date)}`, crumbs: [{ label: 'My bookings', href: '/account' }, { label: b.ref }] })}
    <section class="section"><div class="container bk-layout">
      <div class="bk-main stack">
        <div class="card bk-done"><div class="row between"><h2 style="margin:0">${b.event_name || b.custom_event || 'Event'}</h2>${statusBadge(b.status)}</div>
          <dl class="kv"><div><dt>Hall</dt><dd>${b.hall_name}</dd></div><div><dt>Date</dt><dd>${fmtDate(b.event_date)}</dd></div><div><dt>Time</dt><dd>${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}</dd></div><div><dt>Guests</dt><dd>${num(b.guests)}</dd></div>
          <div><dt>Package</dt><dd>${b.package_name || 'Hall only'}</dd></div><div><dt>Customer</dt><dd>${b.customer_name}<br><span class="caption">${b.phone} · ${b.email}</span></dd></div></dl>
          ${b.requirements ? html`<p class="muted"><b>Requirements:</b> ${b.requirements}</p>` : ''}
          ${b.status === 'reserved' && b.hold_expires_at ? html`<div class="alert info">${icon('info')}<div>Your date is on hold until <b>${fmtDT(b.hold_expires_at)}</b>. Pay the advance to confirm.</div></div>` : ''}
          <div class="row" style="margin-top:16px">
            ${b.status === 'reserved' && advDue > 0 ? html`<a class="btn gold" href="/book/pay/${b.id}">Pay advance ${inr(advDue)}</a>` : ''}
            ${b.status === 'confirmed' && b.balance > 0 ? html`<a class="btn" href="/book/pay/${b.id}">Pay balance ${inr(b.balance)}</a>` : ''}
            <a class="btn ghost" href="/api/documents/confirmation/${b.id}" target="_blank" rel="noopener">${icon('download')} Booking PDF</a>
            ${b.paid_amount > 0 ? html`<a class="btn ghost" href="/api/documents/invoice/${b.id}" target="_blank" rel="noopener">${icon('download')} Invoice</a>` : ''}
            ${open ? html`<button class="btn ghost" id="b-cancel" type="button">Cancel booking</button>` : ''}
          </div></div>

        ${open && !past ? html`<details class="card"><summary style="cursor:pointer;font-weight:600">Change date, time or guests</summary>
          <form id="b-mod" class="form-grid" style="margin-top:14px" novalidate>
            <div class="field"><label for="m-date">Date</label><input class="input" id="m-date" name="event_date" type="date" min="${todayISO()}" value="${b.event_date}"></div>
            <div class="field"><label for="m-guests">Guests</label><input class="input" id="m-guests" name="guests" type="number" min="1" value="${b.guests}"></div>
            <div class="field"><label for="m-start">From</label><input class="input" id="m-start" name="start_time" type="time" value="${b.start_time}"></div>
            <div class="field"><label for="m-end">To</label><input class="input" id="m-end" name="end_time" type="time" value="${b.end_time}"></div>
            <div class="field full"><button class="btn" type="submit">Save changes</button><p class="caption" id="m-note" style="margin-top:8px">Changes are allowed up to ${S.booking?.customer_modify_days ?? 7} days before the event and are re-checked for availability and price.</p></div></form></details>` : ''}

        <div class="card"><h3 style="margin-top:0">Payments</h3>
          ${d.payments.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Receipt</th></tr></thead><tbody>
            ${d.payments.map((p) => html`<tr><td>${cap(p.kind)}</td><td>${inr(p.amount)}</td><td>${cap(p.status)}</td><td>${p.receipt_no && ['paid', 'refunded'].includes(p.status) ? html`<a href="/api/documents/receipt/${p.id}" target="_blank" rel="noopener">${p.receipt_no}</a>` : '—'}</td></tr>`)}</tbody></table></div>` : html`<p class="muted">No payments yet.</p>`}</div>

        <div class="card"><h3 style="margin-top:0">Documents</h3>
          ${d.documents.length ? html`<ul class="plain">${d.documents.map((x) => html`<li><a href="/api/documents/file/${x.id}">${x.original_name}</a> <span class="caption">${cap(x.kind)} · ${Math.round(x.size / 1024)} KB</span></li>`)}</ul>` : html`<p class="muted">Upload ID proof or an organisation letter if the team asked for one (JPG, PNG or PDF, up to 5 MB).</p>`}
          <form id="b-doc" class="row" style="margin-top:12px"><select class="input" name="kind" aria-label="Document type" style="max-width:200px"><option value="id_proof">ID proof</option><option value="address_proof">Address proof</option><option value="organisation_letter">Organisation letter</option><option value="other">Other</option></select>
            <input class="input" type="file" name="file" accept=".jpg,.jpeg,.png,.pdf" aria-label="Choose file" required style="max-width:300px"><button class="btn sm" type="submit">Upload</button></form></div>

        ${canReview ? html`<div class="card"><h3 style="margin-top:0">How was your event?</h3><form id="b-rev" class="stack" novalidate>
          <div class="field"><label for="r-rate">Rating</label><select class="input" id="r-rate" name="rating" style="max-width:160px">${[5, 4, 3, 2, 1].map((n) => html`<option value="${n}">${n} ★</option>`)}</select></div>
          <div class="field"><label for="r-title">Title (optional)</label><input class="input" id="r-title" name="title" maxlength="100"></div>
          <div class="field"><label for="r-body">Your review</label><textarea class="input" id="r-body" name="body" minlength="10" maxlength="1500" required></textarea></div>
          <button class="btn" type="submit">Submit review</button><p class="caption">Reviews are published after the team approves them.</p></form></div>` : ''}
      </div>
      <aside class="bk-side"><div class="card bk-sum"><h2 class="bk-h2">${icon('receipt')} Price</h2>
        ${bd ? priceBreakdown(bd) : html`<dl class="kv"><div><dt>Total</dt><dd>${inr(b.total)}</dd></div></dl>`}
        <dl class="kv" style="margin-top:12px"><div><dt>Paid</dt><dd>${inr(b.paid_amount)}</dd></div><div><dt>Balance due</dt><dd><b>${inr(b.balance)}</b></dd></div>${b.refunded_amount ? html`<div><dt>Refunded</dt><dd>${inr(b.refunded_amount)}</dd></div>` : ''}</dl></div></aside>
    </div></section>`);

    $('#b-cancel', ctx.el)?.addEventListener('click', async () => {
      let pv; try { pv = await get(`/api/bookings/${b.id}/cancel-preview`); } catch (e) { toast(e.message, 'err'); return; }
      const msg = b.paid_amount > 0 ? `If you cancel now, ${pv.refund_percent}% of the amount paid is refundable (about ${inr(pv.refund_amount)}), as per our cancellation policy.` : 'No payment has been made, so there is nothing to refund.';
      if (!(await confirmDialog(msg, { title: 'Cancel this booking?', ok: 'Yes, cancel booking', danger: true }))) return;
      try { await post(`/api/bookings/${b.id}/cancel`, {}); toast('Booking cancelled.', 'ok'); render(); } catch (e) { toast(e.message, 'err'); }
    });
    $('#b-mod', ctx.el)?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = formData(e.target); const body = { event_date: f.event_date, start_time: f.start_time, end_time: f.end_time, guests: Number(f.guests) };
      try { await patch(`/api/bookings/${b.id}`, body); toast('Booking updated.', 'ok'); render(); } catch (x) { if (x.details) showFieldErrors(e.target, x.details); toast(x.message, 'err'); }
    });
    $('#b-doc', ctx.el)?.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      try { await api(`/api/bookings/${b.id}/documents`, { method: 'POST', body: fd, raw: true }); toast('Document uploaded.', 'ok'); render(); } catch (x) { toast(x.message, 'err'); }
    });
    $('#b-rev', ctx.el)?.addEventListener('submit', async (e) => {
      e.preventDefault(); const f = formData(e.target);
      try { const r = await post('/api/reviews', { booking_id: b.id, rating: Number(f.rating), title: f.title || undefined, body: f.body }); toast(r.message || 'Thank you!', 'ok'); e.target.innerHTML = '<div class="alert ok">Thank you! Your review will appear once approved.</div>'; } catch (x) { if (x.details) showFieldErrors(e.target, x.details); toast(x.message, 'err'); }
    });
  }
  await render(); void $$;
}
