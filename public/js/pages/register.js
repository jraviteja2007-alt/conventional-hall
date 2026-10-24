import { html, setHTML, $, toast, showFieldErrors, formData } from '../ui.js';
import { post } from '../api.js';
import { setUser, S } from '../store.js';
import { safeNext } from '../helpers.js';
import { passwordToggle } from './login.js';

const COMMON = ['password', 'password1', '12345678', 'qwerty123', 'iloveyou1', 'admin123', 'welcome1', 'letmein123'];
const pwProblem = (p) => (p.length < 8 ? 'Use at least 8 characters' : !/[A-Za-z]/.test(p) || !/\d/.test(p) ? 'Include both letters and numbers' : COMMON.includes(p.toLowerCase()) ? 'That password is too common' : '');

export default async function register(ctx) {
  ctx.meta('Create account', 'Create an account to book faster and manage your events.');
  if (S.user) { ctx.navigate(safeNext(ctx.query.next), { replace: true }); return; }
  const next = ctx.query.next ? `?next=${encodeURIComponent(ctx.query.next)}` : '';
  setHTML(ctx.el, html`<section class="section page-top"><div class="container" style="max-width:560px">
    <div class="card pad"><h1 style="font-size:2rem">Create your account</h1><p class="muted">Track bookings, pay online and download receipts.</p>
    <form id="rf" novalidate aria-label="Create account"><div class="alert err" id="rf-err" role="alert" hidden></div>
      <div class="form-grid">
        <div class="field"><label for="rf-name">Full name</label><input class="input" id="rf-name" name="name" autocomplete="name" required minlength="2" maxlength="80"></div>
        <div class="field"><label for="rf-phone">Mobile number</label><input class="input" id="rf-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="98765 43210"></div>
        <div class="field full"><label for="rf-email">Email</label><input class="input" id="rf-email" name="email" type="email" autocomplete="email" required></div>
        <div class="field full"><label for="rf-pw">Password</label><div class="row" style="flex-wrap:nowrap"><input class="input" id="rf-pw" name="password" type="password" autocomplete="new-password" required aria-describedby="rf-rules" style="flex:1"><button type="button" class="btn ghost sm" data-toggle-pw="rf-pw" aria-pressed="false" aria-label="Show password">Show</button></div>
          <div class="hint" id="rf-rules">At least 8 characters, with letters and numbers. Avoid common passwords.</div></div>
        <div class="field full"><label for="rf-pw2">Confirm password</label><input class="input" id="rf-pw2" name="confirm" type="password" autocomplete="new-password" required></div>
      </div>
      <button class="btn gold block lg" type="submit">Create account</button></form>
    <p style="margin-top:18px">Already registered? <a href="/login${next}">Sign in</a></p>
    <p class="caption"><a href="/book">Continue as guest</a> – no account needed to book. By registering you accept our <a href="/terms">Terms</a> and <a href="/privacy-policy">Privacy Policy</a>.</p></div></div></section>`);
  const form = $('#rf', ctx.el); passwordToggle(ctx.el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = formData(form); const err = $('#rf-err', ctx.el); err.hidden = true;
    const errs = {};
    if (!f.name || f.name.length < 2) errs.name = 'Enter your full name';
    const ph = f.phone.replace(/[\s-]/g, ''); if (!/^(\+?91)?[6-9]\d{9}$/.test(ph) && !/^\+\d{8,15}$/.test(ph)) errs.phone = 'Enter a valid mobile number';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) errs.email = 'Enter a valid email address';
    const pp = pwProblem(f.password); if (pp) errs.password = pp; else if (f.password !== f.confirm) errs.confirm = 'Passwords do not match';
    if (showFieldErrors(form, errs)) return;
    const btn = $('[type=submit]', form); btn.classList.add('is-loading');
    try {
      const { user } = await post('/api/auth/register', { name: f.name, phone: f.phone, email: f.email, password: f.password });
      setUser(user); toast('Account created. Welcome!', 'ok'); ctx.navigate(safeNext(ctx.query.next), { replace: true });
    } catch (x) {
      btn.classList.remove('is-loading');
      if (x.details) showFieldErrors(form, x.details);
      err.textContent = x.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : x.message; err.hidden = false;
    }
  });
}
