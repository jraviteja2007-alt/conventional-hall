import { html, setHTML, A, load, pageHead, card, ic, money, compact, num, badge, link, dShort, t12, emptyBlock, can, cap } from '../core.js';
import { hbars, lineChart, bindChartTips, STATUS_COLOR } from '../charts.js';

const kpi = (href, icon, label, value, sub = '') => html`<a class="kpi" href="${href}" data-link><div class="lab"><span class="chip-ic">${ic(icon)}</span>${label}</div><div class="val">${value}</div><div class="sub">${sub || raw0}</div></a>`;
const raw0 = ' ';
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

export default async function dashboard({ el }) {
  await load(el, () => A.get('/api/admin/dashboard'), (d) => {
    const items = (rows, k, v) => rows.map((r) => ({ label: cap(r[k]), value: r[v], color: STATUS_COLOR[r[k]] }));
    setHTML(el, html`${pageHead({ title: 'Dashboard', sub: 'Live overview of bookings, enquiries and revenue.', actions: html`${can('bookings.manage') ? html`<a class="btn" href="/admin/bookings" data-link>${ic('book')} Review requests</a>` : ''}` })}
      <div class="grid g4 kpis" style="margin-bottom:18px">
        ${kpi('/admin/bookings', 'book', 'Total bookings', num(d.total_bookings), `${d.pending_requests} awaiting approval`)}
        ${kpi('/admin/calendar', 'calendar', "Today's events", num(d.todays_events), 'Confirmed or approved')}
        ${kpi('/admin/calendar', 'clock', 'Upcoming events', num(d.upcoming_events), 'After today')}
        ${kpi('/admin/enquiries', 'inbox', 'Pending enquiries', num(d.pending_enquiries), 'New or follow-up')}
        ${kpi('/admin/payments', 'rupee', 'Revenue', money(d.revenue), `${money(d.revenue_month)} this month`)}
        ${kpi('/admin/payments', 'card', 'Pending payments', money(d.pending_payments), 'Balance on active bookings')}
        ${kpi('/admin/halls', 'building', 'Available halls', `${d.available_halls} / ${d.halls_total}`, 'Free today')}
        ${kpi('/admin/reviews', 'star', 'To moderate', num(d.pending_reviews), `${d.pending_refunds} refund(s) pending`)}
      </div>
      <div class="grid g2" id="charts">
        ${card('Revenue, last 12 months', lineChart(d.monthly.map((m) => ({ label: monthLabel(m.m), value: m.v })), { label: 'Net revenue' }))}
        ${card('Bookings by status', hbars(items(d.byStatus, 'status', 'c'), { label: 'Bookings' }))}
        ${card('Events mix', hbars(d.byEvent.map((e) => ({ label: e.name, value: e.c })), { label: 'Bookings' }))}
        ${card('Enquiry pipeline', hbars(items(d.enquiries, 'status', 'c'), { label: 'Enquiries' }))}
        ${card('Payment status', hbars(d.payStatus.map((p) => ({ label: p.label, value: p.value, color: STATUS_COLOR[p.label] })), { fmt: money, label: 'Amount' }))}
        ${card('Upcoming events', d.upcoming.length ? html`<div class="agenda">${d.upcoming.map((u) => html`<div class="it"><div><b>${dShort(u.event_date)}</b><div class="cell-sub">${t12(u.start_time)}</div></div><div><a href="/admin/bookings/${u.ref}" data-link>${u.customer_name}</a><div class="cell-sub">${u.hall} · ${num(u.guests)} guests</div></div>${badge(u.status)}</div>`)}</div>` : emptyBlock('No upcoming events', 'New bookings will appear here.'))}
      </div>`);
    bindChartTips(el);
  });
}
