import { html, setHTML, $, $$, A, pageHead, card, ic, badge, t12, dShort, iso, addDays, today, can, toast, on, load, emptyBlock } from '../core.js';
import { formModal } from '../forms.js';
import { confirmDialog } from '/js/ui.js';

const dOf = (ts) => new Date(ts * 60000).toISOString().slice(0, 10);
const ymd = (s) => new Date(`${s}T00:00:00`);
const shift = (date, view, n) => { if (view === 'month') { const d = ymd(date); d.setDate(1); d.setMonth(d.getMonth() + n); return iso(d); } return addDays(date, view === 'week' ? 7 * n : n); };

export default async function calendar({ el }) {
  const halls = (await A.get('/api/halls')).halls;
  const st = { view: 'month', date: today(), hall: '' };
  setHTML(el, html`${pageHead({ title: 'Calendar', sub: 'Every booking and blocked date in one place.', actions: can('blocks.manage') ? html`<button class="btn" id="blk" type="button">${ic('ban')} Block dates / maintenance</button>` : '' })}
    <section class="card"><div class="toolbar"><div class="tabs" role="tablist" aria-label="Calendar view" style="margin:0">${['day', 'week', 'month'].map((v) => html`<button role="tab" type="button" data-v="${v}" aria-selected="${v === 'month'}">${v[0].toUpperCase() + v.slice(1)}</button>`)}</div>
      <div class="row"><button class="btn ghost sm" data-n="-1" type="button" aria-label="Previous">${ic('chevL')}</button><button class="btn ghost sm" data-n="0" type="button">Today</button><button class="btn ghost sm" data-n="1" type="button" aria-label="Next">${ic('chevR')}</button></div>
      <h2 id="ctitle" aria-live="polite" style="min-width:160px"></h2>
      <div class="field" style="margin-left:auto"><label for="ch" class="sr-only">Hall</label><select id="ch"><option value="">All halls</option>${halls.map((h) => html`<option value="${h.id}">${h.name}</option>`)}</select></div></div>
      <div class="card-b" id="cbody" aria-live="polite"></div>
      <div class="card-b legend" style="padding-top:0"><span><i style="background:var(--warn)"></i>Pending</span><span><i style="background:var(--info)"></i>Reserved</span><span><i style="background:var(--good)"></i>Confirmed</span><span><i style="background:var(--crit)"></i>Blocked</span><span><i style="background:var(--s7)"></i>Maintenance</span></div></section>`);
  let data = { bookings: [], blocks: [] }; let seq = 0;
  const items = (day) => [
    ...data.bookings.filter((b) => b.event_date === day).map((b) => ({ kind: 'b', cls: `s-${b.status}`, text: `${t12(b.start_time)} ${b.customer_name}`, b })),
    ...data.blocks.filter((k) => day >= dOf(k.start_ts) && day <= dOf(k.end_ts - 1)).map((k) => ({ kind: 'k', cls: `s-${k.kind}`, text: `${k.kind === 'maintenance' ? 'Maintenance' : 'Blocked'}${halls.length > 1 ? ` · ${k.hall_name}` : ''}`, k })),
  ];
  const evHtml = (it) => (it.kind === 'b' ? html`<a class="ev ${it.cls}" href="/admin/bookings/${it.b.ref}" data-link title="${it.b.ref} · ${it.b.customer_name} · ${it.b.hall_name}">${it.text}</a>` : html`<span class="ev ${it.cls}" title="${it.k.reason || ''}">${it.text}</span>`);
  function draw() {
    const b = $('#cbody', el); const { view, date } = st; const d = ymd(date);
    $('#ctitle', el).textContent = view === 'month' ? d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : view === 'week' ? `${dShort(data.from)} – ${dShort(data.to)}` : dShort(date);
    if (view === 'month') {
      const first = ymd(`${date.slice(0, 7)}-01`); const lead = (first.getDay() + 6) % 7; const start = addDays(iso(first), -lead);
      const cells = Array.from({ length: Math.ceil((lead + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7) * 7 }, (_, i) => addDays(start, i));
      setHTML(b, html`<div class="cal-m" role="grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => html`<div class="cal-dow" role="columnheader">${x}</div>`)}${cells.map((c) => { const it = items(c); return html`<div class="cal-cell ${c.slice(0, 7) !== date.slice(0, 7) ? 'out' : ''} ${c === today() ? 'today' : ''}" role="gridcell" tabindex="0" data-day="${c}" aria-label="${dShort(c)}: ${it.length} item(s)"><span class="n">${Number(c.slice(8))}</span>${it.slice(0, 3).map(evHtml)}${it.length > 3 ? html`<span class="muted small">+${it.length - 3} more</span>` : ''}</div>`; })}</div>`);
    } else if (view === 'week') {
      const days = Array.from({ length: 7 }, (_, i) => addDays(data.from, i));
      setHTML(b, html`<div class="week">${days.map((c) => html`<div class="col"><button type="button" class="btn ghost sm" data-day="${c}">${dShort(c, { weekday: 'short', day: 'numeric', month: 'short' })}</button>${items(c).map(evHtml)}</div>`)}</div>`);
    } else {
      const it = items(date).sort((x, y) => String(x.b?.start_time || x.k?.start).localeCompare(String(y.b?.start_time || y.k?.start)));
      setHTML(b, it.length ? html`<div class="agenda">${it.map((x) => (x.kind === 'b' ? html`<div class="it"><div><b>${t12(x.b.start_time)}</b><div class="cell-sub">to ${t12(x.b.end_time)}</div></div><div><a href="/admin/bookings/${x.b.ref}" data-link>${x.b.customer_name}</a> <span class="muted">· ${x.b.ref}</span><div class="cell-sub">${x.b.event_name} · ${x.b.hall_name} · ${x.b.guests} guests</div></div>${badge(x.b.status)}</div>`
        : html`<div class="it"><div><b>${x.k.start}</b><div class="cell-sub">to ${x.k.end}</div></div><div>${x.k.kind === 'maintenance' ? 'Maintenance' : 'Blocked'} · ${x.k.hall_name}<div class="cell-sub">${x.k.reason || ''}</div></div>${can('blocks.manage') ? html`<button class="btn sm danger" data-del="${x.k.id}" type="button">${ic('trash')} Remove</button>` : ''}</div>`))}</div>` : emptyBlock('Nothing scheduled', 'This day is free.'));
    }
  }
  async function fetchData() {
    const my = ++seq; $('#cbody', el).setAttribute('aria-busy', 'true');
    try { const r = await A.get(`/api/admin/calendar${A.qs({ view: st.view, date: st.date, hall: st.hall })}`); if (my !== seq) return; data = r; draw(); } catch (e) { toast(e.message, 'err'); } finally { $('#cbody', el)?.removeAttribute('aria-busy'); }
  }
  on(el, 'click', '[data-v]', (e, t) => { st.view = t.dataset.v; $$('[data-v]', el).forEach((x) => x.setAttribute('aria-selected', String(x === t))); fetchData(); });
  on(el, 'click', '[data-n]', (e, t) => { const n = Number(t.dataset.n); st.date = n === 0 ? today() : shift(st.date, st.view, n); fetchData(); });
  on(el, 'click', '[data-day]', (e, t) => { if (e.target.closest('a')) return; st.date = t.dataset.day; st.view = 'day'; $$('[data-v]', el).forEach((x) => x.setAttribute('aria-selected', String(x.dataset.v === 'day'))); fetchData(); });
  on(el, 'keydown', '[data-day]', (e, t) => { if (e.key === 'Enter') t.click(); });
  on(el, 'click', '[data-del]', async (e, t) => { if (await confirmDialog('Remove this block? The dates become bookable again.', { ok: 'Remove', danger: true })) { try { await A.del(`/api/admin/blocks/${t.dataset.del}`); toast('Block removed', 'ok'); fetchData(); } catch (err) { toast(err.message, 'err'); } } });
  $('#ch', el).addEventListener('change', (e) => { st.hall = e.target.value; fetchData(); });
  $('#blk', el)?.addEventListener('click', () => formModal({ title: 'Block dates or schedule maintenance', submit: 'Block', values: { hallId: halls[0]?.id, kind: 'blocked', startDate: st.date, endDate: st.date, startTime: '00:00', endTime: '23:59' },
    fields: [{ name: 'hallId', label: 'Hall', type: 'select', options: halls.map((h) => [h.id, h.name]) }, { name: 'kind', label: 'Type', type: 'select', options: [['blocked', 'Blocked (owner use / private)'], ['maintenance', 'Maintenance']] },
      { name: 'startDate', label: 'From date', type: 'date', required: true }, { name: 'endDate', label: 'To date', type: 'date', required: true }, { name: 'startTime', label: 'From time', type: 'time' }, { name: 'endTime', label: 'To time', type: 'time' }, { name: 'reason', label: 'Reason', type: 'text', full: true }],
    onSave: async (v) => { await A.post('/api/admin/blocks', { ...v, hallId: Number(v.hallId) }); toast('Dates blocked', 'ok'); fetchData(); } }));
  await fetchData();
}
