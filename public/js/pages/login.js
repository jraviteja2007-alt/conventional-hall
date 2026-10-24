import { html, setHTML, $, icon, toast, showFieldErrors, formData } from '../ui.js';
import { post } from '../api.js';
import { setUser, S } from '../store.js';
import { safeNext } from '../helpers.js';

export function passwordToggle(root) {
  root.querySelectorAll('[data-toggle-pw]').forEach((b) => b.addEventListener('click', () => {
    const i = root.querySelector(`#${b.dataset.togglePw}`); const show = i.type === 'password'; i.type = show ? 'text' : 'password';
    b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));
}

export default async function login(ctx) {
  ctx.meta('Sign in', 'Sign in to manage your bookings.');
  if (S.user) { ctx.navigate(S.user.staff ? '/account' : safeNext(ctx.query.next), { replace: true }); return; }
  const next = ctx.query.next ? `?next=${encodeURIComponent(ctx.query.next)}` : '';
  setHTML(ctx.el, html`<section class="section page-top"><div class="container" style="max-width:480px">
    <div class="card pad"><h1 style="font-size:2rem">Welcome back</h1><p class="muted">Sign in to view bookings, payments and documents.</p>
    <form id="lf" novalidate aria-label="Sign in"><div class="alert err" id="lf-err" role="alert" hidden></div>
      <div class="field"><label for="lf-email">Email</label><input class="input" id="lf-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="lf-pw">Password</label><div class="row" style="flex-wrap:nowrap"><input class="input" id="lf-pw" name="password" type="password" autocomplete="current-password" required style="flex:1"><button type="button" class="btn ghost sm" data-toggle-pw="lf-pw" aria-pressed="false" aria-label="Show password">Show</button></div></div>
      <button class="btn gold block lg" type="submit">Sign in</button></form>
    <p style="margin-top:18px">New here? <a href="/register${next}">Create an account</a></p>
    <p class="caption"><a href="/book">Continue as guest</a> – you can book without an account.</p></div></div></section>`);
  const form = $('#lf', ctx.el); passwordToggle(ctx.el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = formData(form); const err = $('#lf-err', ctx.el); err.hidden = true;
    const errs = {}; if (!/^\S+@\S+\.\S+$/.test(f.email)) errs.email = 'Enter a valid email address'; if (!f.password) errs.password = 'Enter your password';
    if (showFieldErrors(form, errs)) return;
    const btn = $('[type=submit]', form); btn.classList.add('is-loading');
    try {
      const { user } = await post('/api/auth/login', { email: f.email, password: f.password });
      setUser(user); toast(`Welcome, ${user.name.split(' ')[0]}!`, 'ok');
      if (user.staff) location.assign('/admin'); else ctx.navigate(safeNext(ctx.query.next), { replace: true });
    } catch (x) {
      btn.classList.remove('is-loading');
      if (x.details) showFieldErrors(form, x.details);
      err.textContent = x.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : x.message; err.hidden = false; err.focus?.();
    }
  });
}
