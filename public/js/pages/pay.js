// Payment page. The browser only starts a gateway order and passes back the gateway's signed result;
// the server recomputes the signature before crediting anything (never trusts the frontend).
import { html, setHTML, $, icon, inr, fmtDate, fmtTime, toast, errorState } from '../ui.js';
import { S } from '../store.js';
import { get, post } from '../api.js';
import { pageHero } from '../components.js';

function loadRazorpay() {
  return new Promise((res, rej) => {
    if (window.Razorpay) return res();
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the payment window. Check your connection.')); document.head.append(s);
  });
}

export default async function pay(ctx) {
  if (!S.user) { ctx.navigate(`/login?next=${encodeURIComponent(ctx.path)}`, { replace: true }); return; }
  let d;
  try { d = await get(`/api/bookings/${encodeURIComponent(ctx.params.ref)}`); } catch (e) { setHTML(ctx.el, html`${pageHero({ title: 'Payment', crumbs: [{ label: 'Payment' }] })}<div class="container section">${errorState(e.message)}</div>`); return; }
  const b = d.booking; ctx.meta(`Pay for ${b.ref}`, 'Secure online payment.');
  const advDue = Math.max(0, b.advance_due - b.paid_amount); const kind = advDue > 0 ? 'advance' : 'balance'; const amount = kind === 'advance' ? advDue : b.balance;
  const payable = ['reserved', 'confirmed'].includes(b.status) && amount > 0;
  setHTML(ctx.el, html`
  ${pageHero({ title: 'Secure payment', sub: `Booking ${b.ref} · ${b.hall_name} · ${fmtDate(b.event_date)}, ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`, crumbs: [{ label: 'Booking', href: `/booking/${b.id}` }, { label: 'Pay' }] })}
  <section class="section"><div class="container" style="max-width:640px"><div class="card bk-done">
    ${payable ? html`
      <p class="caption" style="margin-top:0">${kind === 'advance' ? 'Booking advance' : 'Balance payment'}</p>
      <p class="price" style="font-size:2.4rem;margin:.2em 0">${inr(amount)}</p>
      <dl class="kv"><div><dt>Total (incl. GST)</dt><dd>${inr(b.total)}</dd></div><div><dt>Already paid</dt><dd>${inr(b.paid_amount)}</dd></div></dl>
      <div class="alert info" id="pay-demo" hidden>${icon('info')}<div><b>Demo mode.</b> No real money moves. Configure Razorpay or Stripe keys on the server to take live payments.</div></div>
      <button class="btn gold lg" id="pay-go" type="button" style="margin-top:18px">${icon('lock')} Pay ${inr(amount)} securely</button>
      <p class="caption" id="pay-err" role="alert" style="color:var(--error,#c8372d)" hidden></p>
    ` : html`<div class="alert info">${icon('info')}<div>${b.status === 'pending' ? 'This booking is awaiting approval. You can pay once it has been approved.' : amount <= 0 ? 'Nothing is due on this booking.' : `Payments are not available for a ${b.status} booking.`}</div></div><a class="btn" href="/booking/${b.id}" style="margin-top:16px">Back to booking</a>`}
  </div></div></section>`);
  if (!payable) return;
  const btn = $('#pay-go', ctx.el); const err = $('#pay-err', ctx.el);
  const fail = (m) => { btn.classList.remove('is-loading'); btn.disabled = false; err.textContent = m; err.hidden = false; toast(m, 'err'); };
  const success = () => { toast('Payment received. Thank you!', 'ok'); ctx.navigate(`/book/done/${b.id}`); };
  btn.addEventListener('click', async () => {
    err.hidden = true; btn.classList.add('is-loading'); btn.disabled = true;
    try {
      const o = await post(`/api/bookings/${b.id}/pay`, { kind });
      if (o.mock) {
        $('#pay-demo', ctx.el).hidden = false; await new Promise((r) => setTimeout(r, 700));
        const c = await post('/api/payments/mock/checkout', { order_id: o.order_id });
        await post('/api/payments/verify', { order_id: c.order_id, payment_id: c.payment_id, signature: c.signature }); success();
      } else if (o.provider === 'razorpay') {
        await loadRazorpay();
        const rz = new window.Razorpay({ key: o.key_id, amount: o.amount * 100, currency: o.currency, order_id: o.order_id, name: S.site.name, description: `Booking ${b.ref}`, prefill: { name: b.customer_name, email: b.email, contact: b.phone },
          handler: async (r) => { try { await post('/api/payments/verify', { order_id: r.razorpay_order_id, payment_id: r.razorpay_payment_id, signature: r.razorpay_signature }); success(); } catch (e) { fail(e.message); } },
          modal: { ondismiss: () => fail('Payment window closed. You have not been charged.') } });
        rz.open();
      } else fail('This payment provider is not available in the browser yet. Please contact us to pay.');
    } catch (e) { fail(e.message); }
  });
}
