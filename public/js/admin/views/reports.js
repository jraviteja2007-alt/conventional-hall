import { html, setHTML, $, $$, A, pageHead, card, ic, money, num, cap, toast, today, addDays, on, kv, load, errBlock, emptyBlock } from '../core.js';
import { lineChart, hbars, bindChartTips } from '../charts.js';

const REPORTS = [['revenue', 'Revenue'], ['bookings', 'Bookings'], ['events', 'Events'], ['packages', 'Packages'], ['customers', 'Customers'], ['payments', 'Payments']];
const MONEY = new Set(['gross', 'refunded', 'net', 'value', 'v']);
const LABEL = { period: 'Period', payments: 'Payments', gross: 'Gross', refunded: 'Refunded', net: 'Net', total: 'Total', confirmed: 'Confirmed', pending: 'Pending', lost: 'Lost/cancelled', name: 'Name', bookings: 'Bookings', value: 'Value', avg_guests: 'Avg guests', phone: 'Phone', method: 'Method', c: 'Count', v: 'Amount' };
const fmtCell = (k, v) => (v == null ? '' : MONEY.has(k) ? money(v) : typeof v === 'number' ? num(v) : v);

export default async function reports({ el, query }) {
  const st = { name: REPORTS.some(([k]) => k === query.report) ? query.report : 'revenue', group: 'day', from: addDays(today(), -29), to: today() };
  setHTML(el, html`${pageHead({ title: 'Reports', sub: 'Revenue, bookings, events, customers and payments. Export for accounting.', actions: html`<button class="btn ghost no-print" id="prn" type="button">${ic('pdf')} Print / Save PDF</button>` })}
    <section class="card"><div class="toolbar no-print"><div class="field"><label for="rn">Report</label><select id="rn">${REPORTS.map(([k, l]) => html`<option value="${k}" ${k === st.name ? 'selected' : ''}>${l}</option>`)}</select></div>
      <div class="field" id="gw"><label for="rg">Group by</label><select id="rg"><option value="day">Daily</option><option value="month">Monthly</option><option value="year">Yearly</option></select></div>
      <div class="field"><label for="rf">From</label><input type="date" id="rf" value="${st.from}"></div><div class="field"><label for="rt">To</label><input type="date" id="rt" value="${st.to}"></div>
      <span class="row" style="margin-left:auto"><button class="btn ghost sm" data-x="csv" type="button">${ic('download')} CSV</button><button class="btn ghost sm" data-x="xls" type="button">${ic('download')} Excel</button><button class="btn ghost sm" data-x="pdf" type="button">${ic('pdf')} PDF</button></span></div>
      <div class="card-b" id="rb" aria-live="polite"></div></section>`);
  const body = $('#rb', el); let seq = 0;
  const params = () => A.qs({ from: st.from, to: st.to, group: st.group });
  async function run() {
    const my = ++seq; $('#gw', el).hidden = !['revenue', 'bookings'].includes(st.name); setHTML(body, html`<div class="skeleton sk-block"></div>`);
    try {
      const r = await A.get(`/api/admin/reports/${st.name}${params()}`); if (my !== seq) return;
      const cols = r.columns; const rows = r.rows; const m = r.meta || {};
      const summary = st.name === 'revenue' && m.totals ? kv([['Gross', money(m.totals.gross)], ['Refunded', money(m.totals.refunded)], ['Net revenue', money(m.totals.net)]])
        : st.name === 'customers' && m.totals ? kv([['Customers', num(m.totals.customers)], ['Paying', num(m.totals.paying)], ['New (30 days)', num(m.totals.new_30d)], ['Repeat customers', num(m.repeat)]])
        : st.name === 'payments' ? kv([['Paid', money(m.paid?.v)], ['Refunded', money(m.refunded?.v)], ['Pending balance', money(m.pending?.v)], ['Refunds awaiting', money(m.pendingRefunds?.v)]]) : '';
      const chart = st.name === 'revenue' ? lineChart(rows.map((x) => ({ label: x.period, value: x.net })), { label: 'Net revenue' }) : ['events', 'packages'].includes(st.name) ? hbars(rows.map((x) => ({ label: x.name, value: x.bookings })), { label: 'Bookings' }) : st.name === 'bookings' ? lineChart(rows.map((x) => ({ label: x.period, value: x.total })), { fmt: num, label: 'Bookings', color: 'var(--s3)' }) : '';
      setHTML(body, html`<h2 style="margin-bottom:12px">${REPORTS.find(([k]) => k === st.name)[1]} · ${st.from} → ${st.to}</h2>${summary}<div style="margin:18px 0">${chart}</div>
        ${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => html`<th scope="col" class="${MONEY.has(c) || typeof rows[0][c] === 'number' ? 'right' : ''}">${LABEL[c] || cap(c)}</th>`)}</tr></thead><tbody>${rows.map((x) => html`<tr>${cols.map((c) => html`<td class="${MONEY.has(c) || typeof x[c] === 'number' ? 'right' : ''}">${fmtCell(c, x[c])}</td>`)}</tr>`)}</tbody></table></div>` : emptyBlock('No data for this period', 'Try widening the date range.')}`);
      bindChartTips(body);
    } catch (e) { if (e.status !== 401) { setHTML(body, errBlock(e.message)); $('[data-retry]', body)?.addEventListener('click', run); } }
  }
  $('#rn', el).addEventListener('change', (e) => { st.name = e.target.value; run(); });
  $('#rg', el).addEventListener('change', (e) => { st.group = e.target.value; run(); });
  $('#rf', el).addEventListener('change', (e) => { st.from = e.target.value; run(); });
  $('#rt', el).addEventListener('change', (e) => { st.to = e.target.value; run(); });
  $('#prn', el).addEventListener('click', () => window.print());
  on(el, 'click', '[data-x]', (e, b) => window.open(`/api/admin/export/${st.name}${params()}&format=${b.dataset.x}`, '_blank', 'noopener'));
  await run();
}
