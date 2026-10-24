// Customer dashboard: upcoming/past bookings, payments, notifications and profile.
import { html, setHTML, $, $$, icon, inr, num, fmtDate, fmtTime, fmtDT, toast, errorState, emptyState, showFieldErrors, formData, todayISO, cap } from '../ui.js';
import { S, setUser } from '../store.js';
import { get, post, patch } from '../api.js';
import { pageHero } from '../components.js';
import { statusBadge } from '../helpers.js';

export default async function account(ctx) {
  if (!S.user) { ctx.navigate(`/login?next=${encodeURIComponent('/account')}`, { replace: true }); return; }
  ctx.meta('My account', 'Your bookings, payments and notifications.');
  let bk, nt;
  try { [bk, nt] = await Promise.all([get('/api/bookings'), get('/api/notifications')]); } catch (e) { setHTML(ctx.el, html`${pageHero({ title: 'My account', crumbs: [{ label: 'Account' }] })}<div class="container section">${errorState(e.message)}</div>`); return; }
  const today = todayISO(); const all = bk.bookings;
  const upcoming = all.filter((b) => b.event_date >= today && ['pending', 'reserved', 'confirmed'].includes(b.status));
  const history = all.filter((b) => !upcoming.includes(b));
  const payments = all.flatMap((b) => b.payments.map((p) => ({ ...p, ref: b.ref, bid: b.id })));
  const dueTotal = all.filter((b) => ['reserved', 'confirmed'].includes(b.status)).reduce((s, b) => s + Math.max(0, b.status === 'reserved' ? b.advance_due - b.paid_amount : 0), 0);
  const card = (b) => html`<article class="card bk-row"><div><div class="row" style="gap:10px"><b>${b.event_name || b.custom_event || 'Event'}</b>${statusBadge(b.status)}</div>
    <div class="caption">${b.ref} · ${b.hall_name} · ${fmtDate(b.event_date)}, ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)} · ${num(b.guests)} guests</div>
    <div class="caption">Total ${inr(b.total)} · Paid ${inr(b.paid_amount)}${b.balance ? ` · Balance ${inr(b.balance)}` : ''}</div></div>
    <div class="row">${b.status === 'reserved' && b.advance_due > b.paid_amount ? html`<a class="btn gold sm" href="/book/pay/${b.id}">Pay advance</a>` : ''}<a class="btn sm" href="/booking/${b.id}">View</a></div></article>`;
  const tabs = [['up', `Upcoming (${upcoming.length})`], ['hist', `History (${history.length})`], ['pay', 'Payments'], ['note', `Notifications${nt.unread ? ` (${nt.unread})` : ''}`], ['prof', 'Profile']];
  setHTML(ctx.el, html`
  ${pageHero({ title: `Welcome, ${S.user.name.split(' ')[0]}`, sub: 'Manage your events, payments and details.', crumbs: [{ label: 'Account' }] })}
  <section class="section"><div class="container">
    <div class="grid g3" style="margin-bottom:24px"><div class="card stat-tile"><b>${upcoming.length}</b><span>Upcoming events</span></div><div class="card stat-tile"><b>${all.length}</b><span>Total bookings</span></div><div class="card stat-tile"><b>${inr(dueTotal)}</b><span>Advance due</span></div></div>
    <div class="chips" role="tablist" aria-label="Account sections">${tabs.map(([k, l], i) => html`<button class="chip ${i ? '' : 'active'}" role="tab" data-tab="${k}" aria-selected="${i === 0}" type="button">${l}</button>`)}<a class="btn gold sm" href="/book" style="margin-left:auto">New booking</a></div>
    <div id="tab" style="margin-top:20px" aria-live="polite"></div>
  </div></section>`);

  const panes = {
    up: () => (upcoming.length ? html`<div class="stack">${upcoming.map(card)}</div>` : emptyState('No upcoming events', 'Check availability and book your date.', html`<a class="btn" href="/availability">Check availability</a>`)),
    hist: () => (history.length ? html`<div class="stack">${history.map(card)}</div>` : emptyState('No past bookings', 'Completed, cancelled and expired bookings appear here.')),
    pay: () => (payments.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th scope="col">Booking</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Receipt</th></tr></thead><tbody>${payments.map((p) => html`<tr><td><a href="/booking/${p.bid}">${p.ref}</a></td><td>${cap(p.kind)}</td><td>${inr(p.amount)}</td><td>${cap(p.status)}</td><td>${p.receipt_no && ['paid', 'refunded'].includes(p.status) ? html`<a href="/api/documents/receipt/${p.id}" target="_blank" rel="noopener">${p.receipt_no}</a>` : '—'}</td></tr>`)}</tbody></table></div>` : emptyState('No payments yet', 'Payments appear here once you pay an advance.')),
    note: () => (nt.notifications.length ? html`<div class="stack">${nt.notifications.map((n) => html`<article class="card ${n.is_read ? '' : 'unread'}"><div class="row between"><b>${n.title}</b><span class="caption">${fmtDT(n.created_at)}</span></div><p class="muted" style="margin:6px 0 0">${n.body || ''}</p>${n.link ? html`<a href="${n.link}" class="caption">Open</a>` : ''}</article>`)}</div><button class="btn ghost sm" id="mark" type="button" style="margin-top:14px">Mark all as read</button>` : emptyState('No notifications', 'Booking updates will show up here.')),
    prof: () => html`<div class="grid g2"><form class="card" id="pf" novalidate><h3 style="margin-top:0">Profile &amp; saved details</h3>
      <div class="field"><label for="p-name">Name</label><input class="input" id="p-name" name="name" value="${S.user.name}" required minlength="2"></div>
      <div class="field"><label for="p-phone">Mobile</label><input class="input" id="p-phone" name="phone" type="tel" value="${S.user.phone || ''}" required></div>
      <div class="field"><label for="p-email">Email</label><input class="input" id="p-email" value="${S.user.email}" disabled></div>
      <button class="btn" type="submit" style="margin-top:8px">Save profile</button></form>
      <form class="card" id="pw" novalidate><h3 style="margin-top:0">Change password</h3>
      <div class="field"><label for="w-cur">Current password</label><input class="input" id="w-cur" name="current" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="w-new">New password</label><input class="input" id="w-new" name="password" type="password" autocomplete="new-password" required minlength="8"><span class="caption">At least 8 characters with letters and numbers.</span></div>
      <button class="btn" type="submit" style="margin-top:8px">Update password</button></form></div>
      <p style="margin-top:20px"><button class="btn ghost" id="out" type="button">Sign out</button></p>`,
  };
  const pane = $('#tab', ctx.el);
  function show(k) {
    $$('[data-tab]', ctx.el).forEach((b) => { const on = b.dataset.tab === k; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    setHTML(pane, panes[k]());
    $('#mark', pane)?.addEventListener('click', async () => { await post('/api/notifications/read', {}); nt.notifications.forEach((n) => { n.is_read = 1; }); nt.unread = 0; show('note'); });
    $('#pf', pane)?.addEventListener('submit', async (e) => { e.preventDefault(); const f = formData(e.target); try { const { user } = await patch('/api/auth/me', { name: f.name, phone: f.phone }); setUser(user); toast('Profile saved.', 'ok'); } catch (x) { if (x.details) showFieldErrors(e.target, x.details); toast(x.message, 'err'); } });
    $('#pw', pane)?.addEventListener('submit', async (e) => { e.preventDefault(); const f = formData(e.target); try { await post('/api/auth/password', { current: f.current, password: f.password }); toast('Password updated.', 'ok'); e.target.reset(); } catch (x) { if (x.details) showFieldErrors(e.target, x.details); toast(x.message, 'err'); } });
    $('#out', pane)?.addEventListener('click', async () => { await post('/api/auth/logout', {}); setUser(null); ctx.navigate('/'); });
  }
  $('.chips', ctx.el).addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
  show('up'); void icon;
}
