import { html, setHTML, $, icon, inr, num, fmtDate, fmtTime, toast, track, todayISO } from '../ui.js';
import { S } from '../store.js';
import { get, post } from '../api.js';
import { pageHero, mountCalendar, mountSlots } from '../components.js';
import { qsOf } from '../helpers.js';
import { IMG } from '../images.js';

const STATUS = {
  available: ['success', 'Available', 'This date is open.'],
  pending: ['warning', 'Pending', 'A request is awaiting approval. You can still enquire; some hours may be free.'],
  reserved: ['warning', 'Reserved', 'Approved and awaiting advance payment. Some hours may still be free.'],
  confirmed: ['error', 'Booked', 'Confirmed booking. Other hours may still be free.'],
  blocked: ['neutral', 'Blocked', 'Not available on this date.'],
  maintenance: ['neutral', 'Maintenance', 'The hall is closed for maintenance.'],
};

export default async function availability(ctx) {
  ctx.meta('Check Availability', 'See live availability for our halls and get an indicative price for your date.');
  const q = ctx.query; let hall = S.halls.find((h) => h.id === Number(q.hall)) || S.halls[0];
  if (!hall) { setHTML(ctx.el, html`${pageHero({ title: 'Availability', crumbs: [{ label: 'Availability' }] })}<div class="container section"><div class="alert info">Halls are being set up. Please <a href="/contact">contact us</a>.</div></div>`); return; }
  let date = q.date && q.date >= todayISO() ? q.date : null; let pick = null; let dayInfo = null; let seq = 0;

  setHTML(ctx.el, html`${pageHero({ title: 'Check availability', sub: 'Live calendar. Select a date, choose your hours and see the price.', crumbs: [{ label: 'Availability' }], image: IMG.emptyBanquetRed })}
  <section class="section"><div class="container book-layout">
    <div class="stack">
      ${S.halls.length > 1 ? html`<div class="field"><label for="av-hall">Hall</label><select class="input" id="av-hall">${S.halls.map((h) => html`<option value="${h.id}" ${h.id === hall.id ? 'selected' : ''}>${h.name} (up to ${num(h.max_guests)} guests)</option>`)}</select></div>` : html`<p class="lead" style="margin:0">${hall.name}</p>`}
      <div id="av-cal" class="card pad"></div>
      <div id="av-day" aria-live="polite"></div>
    </div>
    <aside class="card pad summary" aria-label="Your selection"><h3>${icon('calendar')} Your selection</h3><div id="av-sum"><p class="muted">Select a date on the calendar to begin.</p></div></aside>
  </div></section>`);

  const cal = mountCalendar($('#av-cal', ctx.el), { hallId: hall.id, selected: date, onSelect: (d, info) => { date = d; dayInfo = info; pick = null; renderDay(); } });
  $('#av-hall', ctx.el)?.addEventListener('change', (e) => { hall = S.halls.find((h) => h.id === Number(e.target.value)); cal.setHall(hall.id); pick = null; if (date) renderDay(); history.replaceState({}, '', `/availability${qsOf({ hall: hall.id, date })}`); });

  async function renderDay() {
    const my = ++seq; const box = $('#av-day', ctx.el); history.replaceState({}, '', `/availability${qsOf({ hall: hall.id, date })}`);
    const st = STATUS[dayInfo?.status || 'available'] || STATUS.available;
    setHTML(box, html`<div class="card pad"><div class="row between"><h3 style="margin:0">${fmtDate(date)}</h3><span class="badge ${st[0]}">${st[1]}</span></div><p class="muted">${st[2]}</p>
      ${['blocked', 'maintenance'].includes(dayInfo?.status) ? '' : html`<h4>Choose your hours</h4><div id="av-slots"></div>`}</div>`);
    renderSum();
    if (['blocked', 'maintenance'].includes(dayInfo?.status)) return;
    await mountSlots($('#av-slots', ctx.el), { hallId: hall.id, date, picked: pick, onPick: (p) => { pick = p; renderSum(); } });
    if (my !== seq) return;
  }

  async function renderSum() {
    const sum = $('#av-sum', ctx.el); const my = ++seq;
    if (!date) return;
    if (!pick) { setHTML(sum, html`<p><b>${hall.name}</b><br>${fmtDate(date)}</p><p class="muted">Now choose a time slot.</p>`); return; }
    setHTML(sum, html`<p><b>${hall.name}</b><br>${fmtDate(date)} · ${fmtTime(pick.start)} – ${fmtTime(pick.end)}</p>
      <div class="field"><label for="av-guests">Guests</label><input class="input" id="av-guests" type="number" min="1" max="${hall.max_guests}" value="${Math.min(300, hall.max_guests)}" inputmode="numeric"><div class="hint">${num(hall.min_guests)} – ${num(hall.max_guests)} guests in this hall</div></div><div id="av-res" aria-live="polite"><div class="skeleton" style="height:70px"></div></div>`);
    const input = $('#av-guests', ctx.el); let t;
    const run = async () => {
      const id = ++seq; const out = $('#av-res', ctx.el); if (!out) return; const guests = Number(input.value);
      try {
        const av = await get(`/api/availability/check${qsOf({ hall: hall.id, date, start: pick.start, end: pick.end })}`);
        if (id !== seq) return; track('availability_check');
        if (!av.available) { setHTML(out, html`<div class="alert err" role="alert">${icon('alert')}<div><b>Not available</b><br>These hours are already taken. Try another slot or date.</div></div>`); return; }
        if (!guests || guests < hall.min_guests || guests > hall.max_guests) { setHTML(out, html`<div class="alert warn">${icon('info')}<div>Enter between ${num(hall.min_guests)} and ${num(hall.max_guests)} guests for an estimate.</div></div>`); return; }
        let quote = null; let err = '';
        try { quote = (await post('/api/pricing/quote', { hallId: hall.id, date, start: pick.start, end: pick.end, guests })).quote; } catch (e) { err = e.message; }
        if (id !== seq) return;
        setHTML(out, html`<div class="alert ok" role="status">${icon('check')}<div><b>Available</b>${av.pendingRequests ? html`<br><span class="caption">Other requests are pending for this slot, so book early.</span>` : ''}</div></div>
          ${quote ? html`<p style="margin:14px 0 4px"><span class="price">${inr(quote.total)}</span> <small>incl. ${quote.tax ? `${quote.tax.name} ` : 'taxes'}</small></p><p class="caption">Hall rental estimate before add-ons. Advance ${inr(quote.advance)}.</p>` : html`<p class="caption">${err}</p>`}
          <a class="btn gold block" href="/book${qsOf({ hall: hall.id, date, start: pick.start, end: pick.end, guests })}" data-track="book_click">Book this slot</a>`);
      } catch (e) { setHTML(out, html`<div class="alert err" role="alert">${e.message}</div>`); toast(e.message, 'err'); }
    };
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 400); });
    ctx.onCleanup(() => clearTimeout(t)); run(); if (my !== seq) return;
  }

  if (date) { dayInfo = null; renderDay(); get(`/api/availability/calendar?hall=${hall.id}&month=${date.slice(0, 7)}`).then((r) => { dayInfo = r.days.find((d) => d.date === date) || null; if (ctx.isCurrent()) renderDay(); }).catch(() => {}); }
}
