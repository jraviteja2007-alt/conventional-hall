// Booking page: one scrolling form with a sticky live price summary (fewer steps = higher conversion).
import { html, setHTML, $, $$, icon, inr, num, fmtDate, fmtTime, toast, track, showFieldErrors, todayISO, esc } from '../ui.js';
import { S } from '../store.js';
import { get, post } from '../api.js';
import { pageHero, priceBreakdown, mountCalendar, mountSlots } from '../components.js';
import { debounceFn, qsOf } from '../helpers.js';
import { IMG } from '../images.js';

const DRAFT = 'bookDraft';
const store = { get: () => { try { return JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch { return null; } }, set: (v) => { try { sessionStorage.setItem(DRAFT, JSON.stringify(v)); } catch { /* private mode */ } }, clear: () => { try { sessionStorage.removeItem(DRAFT); } catch { /* ignore */ } } };

export default async function book(ctx) {
  ctx.meta('Book your event', `Book ${S.site.name}: choose a hall, date and package and see the full GST-inclusive price before you pay.`);
  const q = ctx.query;
  const draft = !Object.keys(q).length ? store.get() : null;
  const [{ packages }, { services }] = await Promise.all([get('/api/packages'), get('/api/services')]);
  const ev0 = S.events.find((e) => e.slug === q.event) || S.events.find((e) => e.id === draft?.event_type_id) || S.events[0];
  const st = {
    event_type_id: ev0?.id, hall_id: Number(q.hall) || draft?.hall_id || S.halls[0]?.id, date: q.date || draft?.date || '', start: q.start || draft?.start || '', end: q.end || draft?.end || '',
    guests: Number(q.guests) || draft?.guests || 200, package_id: Number(q.package) || draft?.package_id || 0, services: draft?.services || {}, coupon: draft?.coupon || '',
    customer_name: draft?.customer_name || S.user?.name || '', phone: draft?.phone || S.user?.phone || '', email: draft?.email || S.user?.email || '', custom_event: draft?.custom_event || '', requirements: draft?.requirements || '',
  };
  const svcGroups = services.reduce((m, s) => { (m[s.category || 'other'] ||= []).push(s); return m; }, {});
  const unit = (s) => (s.price_type === 'per_guest' ? '/guest' : s.price_type === 'per_hour' ? '/hour' : '');

  setHTML(ctx.el, html`
  ${pageHero({ title: 'Book your event', sub: 'Pick your date and package. The price below updates as you choose.', crumbs: [{ label: 'Book' }], image: S.halls[0]?.hero_image || IMG.chandelierHall })}
  <section class="section"><div class="container bk-layout">
    <form id="bk" class="bk-main" novalidate aria-label="Booking form">
      <div class="card bk-sec" id="bk-sec-1">
        <div class="bk-sec-title"><span class="bk-n">1</span> Event &amp; hall</div>
        <div class="form-grid">
          <div class="field"><label for="bk-event">Event type</label><select class="input" id="bk-event" name="event_type_id">${S.events.map((e) => html`<option value="${e.id}" ${e.id === st.event_type_id ? 'selected' : ''}>${e.name}</option>`)}</select></div>
          <div class="field"><label for="bk-hall">Hall</label><select class="input" id="bk-hall" name="hall_id">${S.halls.map((h) => html`<option value="${h.id}" ${h.id === st.hall_id ? 'selected' : ''}>${h.name} (up to ${num(h.max_guests)})</option>`)}</select></div>
          <div class="field"><label for="bk-guests">Number of guests</label><input class="input" id="bk-guests" name="guests" type="number" min="1" max="20000" inputmode="numeric" value="${st.guests}" required></div>
          <div class="field" id="bk-other" hidden><label for="bk-custom">Describe your event</label><input class="input" id="bk-custom" name="custom_event" maxlength="200" value="${st.custom_event}" placeholder="e.g. Annual day, cultural evening"></div>
        </div>
      </div>

      <div class="card bk-sec" id="bk-sec-2">
        <div class="bk-sec-title"><span class="bk-n">2</span> Date &amp; time</div>
        <input type="hidden" name="date" id="bk-f-date" value="${st.date}">
        <input type="hidden" name="start" id="bk-f-start" value="${st.start}">
        <input type="hidden" name="end" id="bk-f-end" value="${st.end}">
        <div class="bk-dt"><div id="bk-cal"></div><div><p class="caption" id="bk-picked" style="margin-top:0">${st.date ? `${fmtDate(st.date)} — choose your hours` : 'Select a date on the calendar to see available hours.'}</p><div id="bk-slots"></div></div></div>
        <div id="bk-dt-err" class="alert err" style="margin-top:14px" hidden></div>
      </div>

      <div class="card bk-sec" id="bk-sec-3">
        <div class="bk-sec-title"><span class="bk-n">3</span> Package &amp; add-ons</div>
        <div class="bk-pk" role="radiogroup" aria-label="Package">
          <label class="bk-opt"><input type="radio" name="package_id" value="0" ${!st.package_id ? 'checked' : ''}><span><b>Hall only</b><small>Bring your own caterer and decorator</small></span></label>
          ${packages.filter((p) => p.tier !== 'custom').map((p) => html`<label class="bk-opt"><input type="radio" name="package_id" value="${p.id}" ${st.package_id === p.id ? 'checked' : ''}><span><b>${p.name}</b><small>${p.description || ''}</small><em>${p.per_guest_price ? `${inr(p.price)} + ${inr(p.per_guest_price)}/guest` : p.price ? inr(p.price) : 'Included'}${p.includes_hall ? ' · hall included' : ''}</em></span></label>`)}
        </div>
        <h3 class="bk-h3">Extra services</h3>
        ${Object.entries(svcGroups).map(([cat, list]) => html`<div class="bk-svc"><h4>${cat.replace(/_/g, ' ')}</h4>${list.map((s) => html`<label class="bk-opt sm"><input type="checkbox" name="svc" value="${s.id}" ${st.services[s.id] ? 'checked' : ''}><span><b>${s.name}</b><em>${inr(s.price)}${unit(s)}</em></span></label>`)}</div>`)}
        <div class="field" style="max-width:320px;margin-top:14px"><label for="bk-coupon">Coupon code</label><div class="row"><input class="input" id="bk-coupon" name="coupon" maxlength="40" value="${st.coupon}" autocapitalize="characters" placeholder="Optional"><button type="button" class="btn ghost sm" id="bk-apply">Apply</button></div></div>
      </div>

      <div class="card bk-sec" id="bk-sec-4">
        <div class="bk-sec-title"><span class="bk-n">4</span> Your details</div>
        <div class="form-grid">
          <div class="field"><label for="bk-name">Full name</label><input class="input" id="bk-name" name="customer_name" autocomplete="name" required minlength="2" maxlength="80" value="${st.customer_name}"></div>
          <div class="field"><label for="bk-phone">Mobile number</label><input class="input" id="bk-phone" name="phone" type="tel" autocomplete="tel" required placeholder="98765 43210" value="${st.phone}"></div>
          <div class="field"><label for="bk-email">Email</label><input class="input" id="bk-email" name="email" type="email" autocomplete="email" required value="${st.email}"></div>
          <div class="field full"><label for="bk-req">Additional requirements</label><textarea class="input" id="bk-req" name="requirements" maxlength="2000" placeholder="Decoration theme, rooms, special arrangements…">${st.requirements}</textarea></div>
        </div>
      </div>
    </form>

    <aside class="bk-side" aria-label="Price summary"><div class="bk-sum" id="bk-sum">
      <h2 class="bk-h2">${icon('receipt')} Your summary</h2>
      <div id="bk-brief" class="caption"></div><div id="bk-price" aria-live="polite"><p class="muted">Step 2: Choose a date and time slot to calculate the exact GST-inclusive price.</p></div>
      <div id="bk-msg" class="alert info" hidden></div>
      <button class="btn gold lg" type="submit" form="bk" id="bk-go" disabled>${S.user ? 'Request booking' : 'Sign in to request booking'}</button>
      <p class="caption" style="margin:10px 0 0">No payment now. We confirm availability, then you pay the advance online to secure the date. GST is shown upfront.</p>
    </div></aside>
  </div></section>`);

  const form = $('#bk', ctx.el); const sum = $('#bk-price', ctx.el); const msg = $('#bk-msg', ctx.el); const go = $('#bk-go', ctx.el);
  let lastQuote = null; let seq = 0;
  const hall = () => S.halls.find((h) => h.id === st.hall_id);
  const sync = () => {
    const f = new FormData(form);
    st.event_type_id = Number(f.get('event_type_id')); st.hall_id = Number(f.get('hall_id')); st.guests = Number(f.get('guests')) || 0; st.package_id = Number(f.get('package_id')) || 0;
    st.coupon = String(f.get('coupon') || '').trim(); st.custom_event = String(f.get('custom_event') || ''); st.customer_name = String(f.get('customer_name') || ''); st.phone = String(f.get('phone') || ''); st.email = String(f.get('email') || ''); st.requirements = String(f.get('requirements') || '');
    st.services = Object.fromEntries(f.getAll('svc').map((id) => [id, 1]));
    $('#bk-other', ctx.el).hidden = !(S.events.find((e) => e.id === st.event_type_id)?.is_other);
    $('#bk-brief', ctx.el).textContent = [hall()?.name, st.date && fmtDate(st.date), st.start && `${fmtTime(st.start)} – ${fmtTime(st.end)}`, st.guests && `${num(st.guests)} guests`].filter(Boolean).join(' · ');
  };
  const refreshQuote = debounceFn(async () => {
    sync(); const my = ++seq; lastQuote = null; go.disabled = true; msg.hidden = true;
    if (!st.date) {
      setHTML(sum, html`<p class="muted">Select a date on the calendar in Step 2 to see available slots and live pricing.</p>`);
      return;
    }
    if (!st.start || !st.end) {
      setHTML(sum, html`<p class="muted">Date: <b>${fmtDate(st.date)}</b><br>Now choose a morning, afternoon, evening, full-day or custom slot in Step 2 to see the price.</p>`);
      return;
    }
    if (!st.guests || st.guests < 1) {
      setHTML(sum, html`<p class="muted">Please enter a valid guest count in Step 1.</p>`);
      return;
    }
    setHTML(sum, html`<div class="skeleton" style="height:160px"></div>`);
    try {
      const r = await post('/api/pricing/quote', { hallId: st.hall_id, date: st.date, start: st.start, end: st.end, guests: st.guests, packageId: st.package_id || undefined, services: Object.keys(st.services).map((id) => ({ id: Number(id), qty: 1 })), coupon: st.coupon || undefined });
      if (my !== seq) return; lastQuote = r;
      setHTML(sum, priceBreakdown(r.quote));
      if (!r.available) {
        msg.className = 'alert err';
        msg.textContent = 'This hall is already booked for those hours. Please pick another slot or hall.';
        msg.hidden = false;
        go.disabled = true;
      } else {
        go.disabled = false;
      }
    } catch (e) {
      if (my !== seq) return;
      setHTML(sum, html`<div class="alert err" role="alert">${e.details ? Object.values(e.details).join(' ') : e.message}</div>`);
    }
  }, 250);

  const cal = mountCalendar($('#bk-cal', ctx.el), {
    hallId: st.hall_id,
    selected: st.date || null,
    onSelect: (d) => {
      st.date = d;
      st.start = '';
      st.end = '';
      const fDate = $('#bk-f-date', ctx.el);
      const fStart = $('#bk-f-start', ctx.el);
      const fEnd = $('#bk-f-end', ctx.el);
      if (fDate) fDate.value = d;
      if (fStart) fStart.value = '';
      if (fEnd) fEnd.value = '';
      const dtErr = $('#bk-dt-err', ctx.el);
      if (dtErr) dtErr.hidden = true;
      slots();
      refreshQuote();
    },
  });

  async function slots() {
    $('#bk-picked', ctx.el).textContent = `${fmtDate(st.date)} — choose your hours`;
    await mountSlots($('#bk-slots', ctx.el), {
      hallId: st.hall_id,
      date: st.date,
      picked: st.start ? { start: st.start, end: st.end } : null,
      onPick: (p) => {
        st.start = p.start;
        st.end = p.end;
        const fStart = $('#bk-f-start', ctx.el);
        const fEnd = $('#bk-f-end', ctx.el);
        if (fStart) fStart.value = p.start;
        if (fEnd) fEnd.value = p.end;
        const dtErr = $('#bk-dt-err', ctx.el);
        if (dtErr) dtErr.hidden = true;
        refreshQuote();
        sync();
      },
    });
  }
  if (st.date) slots();
  form.addEventListener('change', (e) => {
    if (e.target.name === 'hall_id') {
      sync();
      cal.setHall(st.hall_id);
      if (st.date) slots();
    }
    refreshQuote();
  });
  form.addEventListener('input', (e) => { if (['guests', 'coupon'].includes(e.target.name)) refreshQuote(); });
  $('#bk-apply', ctx.el).addEventListener('click', refreshQuote);
  sync(); refreshQuote();

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); sync();
    const errs = {};
    const dtErr = $('#bk-dt-err', ctx.el);
    if (dtErr) dtErr.hidden = true;
    if (!st.date || !st.start || !st.end) {
      errs.date = !st.date ? 'Please select a date on the calendar.' : 'Please choose a time slot for the selected date.';
      if (dtErr) {
        dtErr.textContent = errs.date;
        dtErr.hidden = false;
      }
    }
    if (st.customer_name.length < 2) errs.customer_name = 'Enter your name';
    if (!/^[+\d][\d\s-]{8,16}$/.test(st.phone)) errs.phone = 'Enter a valid mobile number';
    if (!/^\S+@\S+\.\S+$/.test(st.email)) errs.email = 'Enter a valid email';
    if (hall() && st.guests > hall().max_guests) errs.guests = `This hall holds up to ${num(hall().max_guests)} guests`;
    if (Object.keys(errs).length) {
      showFieldErrors(form, errs);
      if (errs.date) {
        toast(errs.date, 'err');
        $('#bk-sec-2', ctx.el)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    if (!S.user) {
      store.set(st);
      toast('Please sign in or create an account to send your request.');
      ctx.navigate(`/login?next=${encodeURIComponent('/book')}`);
      return;
    }
    go.classList.add('is-loading'); go.disabled = true; track('book_click');
    try {
      const body = {
        hall_id: st.hall_id, event_type_id: st.event_type_id, package_id: st.package_id || undefined, customer_name: st.customer_name, phone: st.phone, email: st.email, custom_event: st.custom_event || undefined, requirements: st.requirements || undefined,
        event_date: st.date, start_time: st.start, end_time: st.end, guests: st.guests, coupon: st.coupon || undefined, services: Object.keys(st.services).map((id) => ({ id: Number(id), qty: 1 })),
      };
      const { booking } = await post('/api/bookings', body);
      store.clear(); toast('Booking request sent!', 'ok'); ctx.navigate(`/book/done/${booking.id}`);
    } catch (x) {
      go.classList.remove('is-loading'); go.disabled = false;
      if (x.details) showFieldErrors(form, x.details);
      msg.className = 'alert err'; msg.textContent = x.code === 'SLOT_UNAVAILABLE' || x.status === 409 ? 'Sorry, that slot was just taken. Please choose another time.' : x.message; msg.hidden = false; toast(x.message, 'err');
      refreshQuote();
    }
  });
  void esc; void qsOf; void todayISO; void $$;
}
