import { html, setHTML, A, load, pageHead, card, ic, money, compact, num, badge, link, dShort, t12, emptyBlock, can, cap } from '../core.js';
import { hbars, lineChart, bindChartTips, STATUS_COLOR } from '../charts.js';

const kpi = (href, icon, label, value, sub = '') => html`<a class="kpi" href="${href}" data-link><div class="lab"><span class="chip-ic">${ic(icon)}</span>${label}</div><div class="val">${value}</div><div class="sub">${sub || raw0}</div></a>`;
const raw0 = ' ';
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

export default async function dashboard({ el }) {
  await load(el, () => A.get('/api/admin/dashboard'), (raw) => {
    const s = raw.stats || raw;
    const d = {
      total_bookings: raw.total_bookings ?? s.total_bookings ?? 0,
      pending_requests: raw.pending_requests ?? s.pending_bookings ?? 0,
      todays_events: raw.todays_events ?? s.todays_events ?? 0,
      upcoming_events: raw.upcoming_events ?? s.upcoming_events ?? 0,
      pending_enquiries: raw.pending_enquiries ?? s.new_enquiries ?? 0,
      revenue: raw.revenue ?? s.revenue ?? 0,
      revenue_month: raw.revenue_month ?? 0,
      pending_payments: raw.pending_payments ?? s.pending_payments ?? 0,
      available_halls: raw.available_halls ?? s.halls_free_today ?? 0,
      halls_total: raw.halls_total ?? s.halls_active ?? 0,
      pending_reviews: raw.pending_reviews ?? s.pending_reviews ?? 0,
      pending_refunds: raw.pending_refunds ?? s.pending_refunds ?? 0,
      monthly: raw.monthly || (s.revenue_by_month || []).map((r) => ({ m: r.month, v: r.amount })),
      byStatus: raw.byStatus || (s.by_status || []).map((r) => ({ status: r.status, c: r.count })),
      byEvent: raw.byEvent || (s.by_event || []).map((r) => ({ name: r.name, c: r.count })),
      enquiries: raw.enquiries || (s.enquiries_by_status || []).map((r) => ({ status: r.status, c: r.count })),
      payStatus: raw.payStatus || (s.payment_status || []).map((r) => ({ label: r.status, value: r.amount })),
      upcoming: raw.upcoming || [],
    };

    const items = (rows = [], k, v) => (rows || []).map((r) => ({ label: cap(r[k] || ''), value: r[v] || 0, color: STATUS_COLOR[r[k]] }));
    const monthlyList = (d.monthly || []).map((m) => ({ label: monthLabel(m.m), value: m.v }));
    const statusItems = items(d.byStatus, 'status', 'c');
    const eventItems = (d.byEvent || []).map((e) => ({ label: e.name || 'Other', value: e.c || 0 }));
    const enquiryItems = items(d.enquiries, 'status', 'c');
    const payStatusItems = (d.payStatus || []).map((p) => ({ label: p.label || 'Other', value: p.value || 0, color: STATUS_COLOR[p.label] }));

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
        ${card('Revenue, last 12 months', monthlyList.length ? lineChart(monthlyList, { label: 'Net revenue' }) : emptyBlock('No revenue data', 'Completed bookings will show revenue here.'))}
        ${card('Bookings by status', statusItems.length ? hbars(statusItems, { label: 'Bookings' }) : emptyBlock('No bookings', 'No bookings recorded yet.'))}
        ${card('Events mix', eventItems.length ? hbars(eventItems, { label: 'Bookings' }) : emptyBlock('No events', 'No events booked yet.'))}
        ${card('Enquiry pipeline', enquiryItems.length ? hbars(enquiryItems, { label: 'Enquiries' }) : emptyBlock('No enquiries', 'Customer enquiries will appear here.'))}
        ${card('Payment status', payStatusItems.length ? hbars(payStatusItems, { fmt: money, label: 'Amount' }) : emptyBlock('No payments', 'Payment records will appear here.'))}
        ${card('Upcoming events', (d.upcoming || []).length ? html`<div class="agenda">${d.upcoming.map((u) => html`<div class="it"><div><b>${dShort(u.event_date)}</b><div class="cell-sub">${t12(u.start_time)}</div></div><div><a href="/admin/bookings/${u.ref}" data-link>${u.customer_name}</a><div class="cell-sub">${u.hall} · ${num(u.guests)} guests</div></div>${badge(u.status)}</div>`)}</div>` : emptyBlock('No upcoming events', 'New bookings will appear here.'))}
      </div>`);
    bindChartTips(el);
  });
}
