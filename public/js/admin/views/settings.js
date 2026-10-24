import { html, raw, setHTML, $, $$, A, load, pageHead, card, ic, can, toast, badge, on, cap, state } from '../core.js';
import { field, fieldsHtml, collect, bindUploads } from '../forms.js';
import { showFieldErrors } from '/js/ui.js';

const T = (name, label, extra = {}) => ({ name, label, ...extra });
const C = (name, label) => ({ name, label, type: 'color' });
const B = (name, label, extra = {}) => ({ name, label, type: 'checkbox', full: true, ...extra });
const Nn = (name, label, extra = {}) => ({ name, label, type: 'number', ...extra });
const csvNums = (s) => String(s || '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x >= 0);
const slotsTo = (a) => (a || []).map((s) => [s.id, s.label, s.start, s.end].join(' | '));
const slotsFrom = (l) => l.map((x) => { const [id, label, start, end] = x.split('|').map((y) => y.trim()); return { id, label, start, end }; });
const tiersTo = (a) => (a || []).map((t) => `${t.days_before} | ${t.refund_pct}`);
const tiersFrom = (l) => l.map((x) => { const [d, p] = x.split('|').map((y) => Number(y.trim())); return { days_before: d, refund_pct: p }; });

const TABS = [
  { id: 'site', label: 'General', group: 'site', fields: [T('name', 'Business name', { required: true }), T('tagline', 'Tagline'), T('city', 'Location (city, state, country)'), T('address', 'Full address', { type: 'textarea', rows: 2 }), T('phone', 'Phone', { type: 'tel' }), T('whatsapp', 'WhatsApp number (digits with country code)'), T('email', 'Email', { type: 'email' }),
    Nn('lat', 'Map latitude', { step: 'any' }), Nn('lng', 'Map longitude', { step: 'any' }), T('opening_hours', 'Opening hours', { full: true }), T('about', 'About the hall', { type: 'textarea', rows: 5 }), T('social_facebook', 'Facebook URL'), T('social_instagram', 'Instagram URL'), T('social_youtube', 'YouTube URL')],
    to: (s) => ({ ...s, social_facebook: s.social?.facebook, social_instagram: s.social?.instagram, social_youtube: s.social?.youtube }),
    from: (v, s) => { const { social_facebook: f, social_instagram: i, social_youtube: y, ...rest } = v; return { ...s, ...rest, social: { facebook: f || '', instagram: i || '', youtube: y || '' } }; } },
  { id: 'theme', label: 'Branding & colours', group: 'theme', extra: 'branding', fields: [C('primary', 'Primary'), C('secondary', 'Secondary'), C('accent', 'Accent'), C('background', 'Background'), C('text', 'Text'), C('success', 'Success'), C('warning', 'Warning'), C('error', 'Error'),
    T('logo_url', 'Logo (desktop)', { type: 'image' }), T('logo_mobile_url', 'Logo (mobile)', { type: 'image' }), T('favicon_url', 'Favicon', { type: 'image' }), T('footer_logo_url', 'Footer logo', { type: 'image' })] },
  { id: 'booking', label: 'Booking rules', group: 'booking', fields: [Nn('advance_pct', 'Advance payment (%)', { min: 0, max: 100 }), Nn('hold_minutes', 'Temporary hold (minutes)', { min: 1 }), Nn('min_hours', 'Minimum duration (hours)', { min: 1 }), Nn('max_hours', 'Maximum duration (hours)', { min: 1 }),
    T('open_time', 'Earliest start', { type: 'time' }), T('close_time', 'Latest end', { type: 'time' }), Nn('full_day_hours', 'Full-day hours', { min: 1 }), Nn('half_day_hours', 'Half-day hours', { min: 1 }), Nn('approve_pay_within_hours', 'Pay within (hours) after approval', { min: 1 }), Nn('modify_cutoff_days', 'Changes allowed until (days before)', { min: 0 }),
    Nn('reschedule_cutoff_days', 'Rescheduling allowed until (days before)', { min: 0 }), Nn('max_reschedules', 'Max reschedules', { min: 0 }), Nn('min_advance_days', 'Minimum notice (days)', { min: 0 }), Nn('max_advance_days', 'Bookable up to (days ahead)', { min: 1 }),
    T('slots_text', 'Time slots — id | label | start | end', { type: 'lines', rows: 5 }), T('tiers_text', 'Cancellation policy — days before event | refund %', { type: 'lines', rows: 5 }), B('approval_required', 'Admin must approve online requests before payment'), B('auto_confirm_paid', 'Confirm automatically when the advance is paid')],
    to: (s) => ({ ...s, slots_text: slotsTo(s.slots), tiers_text: tiersTo(s.cancellation_tiers) }), from: (v, s) => { const { slots_text: a, tiers_text: b, ...rest } = v; return { ...s, ...rest, slots: slotsFrom(a), cancellation_tiers: tiersFrom(b) }; } },
  { id: 'notifications', label: 'Notifications', group: 'notifications', fields: [B('email', 'Send email notifications'), B('sms', 'Send SMS notifications (needs an SMS provider)'), B('whatsapp', 'Send WhatsApp notifications (needs a provider)'), T('reminders', 'Reminder days before event (comma separated)'), T('admin_text', 'Admin notification emails (one per line)', { type: 'lines' })],
    to: (s) => ({ ...s, reminders: (s.reminder_days || []).join(', '), admin_text: s.admin_emails || [] }), from: (v, s) => { const { reminders, admin_text: a, ...rest } = v; return { ...s, ...rest, reminder_days: csvNums(reminders), admin_emails: a }; } },
  { id: 'tax', label: 'Tax', group: 'tax', fields: [B('enabled', 'Charge tax on bookings'), T('name', 'Tax name'), Nn('rate', 'Rate (%)', { step: '0.01', min: 0, max: 40 }), T('gstin', 'GSTIN')] },
  { id: 'reviews', label: 'Reviews', group: 'reviews', fields: [B('require_approval', 'Require admin approval before publishing'), Nn('max_rating', 'Rating scale (max)', { min: 3, max: 10 }), B('show_samples', 'Show sample testimonials until real reviews exist')] },
  { id: 'analytics', label: 'Analytics', group: 'analytics', fields: [T('ga4_id', 'Google Analytics 4 ID', { placeholder: 'G-XXXXXXXXXX' }), T('meta_pixel', 'Meta Pixel ID')] },
  { id: 'payments', label: 'Payments', group: 'payments', fields: [T('provider', 'Payment gateway', { type: 'select', options: [['mock', 'Test gateway (no real money)'], ['razorpay', 'Razorpay'], ['stripe', 'Stripe']] }), B('online_enabled', 'Accept online payments'), B('allow_full_payment', 'Let customers pay the full amount upfront')] },
  { id: 'legal', label: 'Legal pages', custom: true },
];
const SECRETS = [['razorpay_key_id', 'Razorpay key ID'], ['razorpay_key_secret', 'Razorpay key secret'], ['razorpay_webhook_secret', 'Razorpay webhook secret'], ['stripe_secret_key', 'Stripe secret key'], ['stripe_webhook_secret', 'Stripe webhook secret']];
const LEGAL_LABEL = { privacy_policy: 'Privacy policy', terms: 'Terms & conditions', cancellation_policy: 'Cancellation policy', refund_policy: 'Refund policy', cookie_policy: 'Cookie policy' };

export default async function settings({ el, query }) {
  await load(el, () => A.get('/api/admin/settings'), (data, reload) => {
    const S = data.settings; let tab = TABS.find((t) => t.id === query.tab) || TABS[0];
    const paint = () => {
      setHTML(el, html`${pageHead({ title: 'Settings', sub: 'Changes apply to the public website immediately.' })}
        <div class="tabs" role="tablist" aria-label="Settings sections">${TABS.map((t) => html`<button role="tab" type="button" data-tab="${t.id}" aria-selected="${t.id === tab.id}">${t.label}</button>`)}</div><div id="pane"></div>`);
      const pane = $('#pane', el);
      if (tab.custom) return legal(pane);
      const base = { ...S[tab.group], ...(tab.extra ? S[tab.extra] : {}) }; const values = tab.to ? tab.to(base) : base;
      setHTML(pane, html`<form class="card" novalidate><div class="card-b"><div class="form-grid">${fieldsHtml(tab.fields, values)}</div></div><div class="card-h" style="border-top:1px solid var(--line);border-bottom:0"><span class="muted small">${data.providers && tab.id === 'payments' ? `Active provider: ${data.providers.payment}` : ''}</span><button class="btn" type="submit">Save changes</button></div></form>${tab.id === 'payments' ? secrets() : ''}`);
      const form = $('form', pane); bindUploads(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); const { out, errs } = collect(form, tab.fields); if (showFieldErrors(form, errs)) return;
        const btn = $('[type=submit]', form); btn.classList.add('is-loading');
        try {
          if (tab.extra) { const br = {}; for (const k of ['logo_url', 'logo_mobile_url', 'favicon_url', 'footer_logo_url']) { br[k] = out[k] || ''; delete out[k]; } S[tab.extra] = (await A.put(`/api/admin/settings/${tab.extra}`, { ...S[tab.extra], ...br })).settings; }
          const body = tab.from ? tab.from(out, S[tab.group]) : { ...S[tab.group], ...out };
          S[tab.group] = (await A.put(`/api/admin/settings/${tab.group}`, body)).settings; toast('Settings saved', 'ok');
          if (tab.id === 'site') { const brand = $('.brand b'); if (brand) brand.textContent = S.site.name; }
        } catch (err) { if (err.details) showFieldErrors(form, err.details); toast(err.message, 'err'); } finally { btn.classList.remove('is-loading'); }
      });
    };
    const secrets = () => (can('settings.secrets') ? card('Gateway credentials', html`<p class="muted small">Keys are stored encrypted and are never shown again. Environment variables, if set on the server, take precedence. Leave a field empty to keep the current value.</p>
      <form id="sec" class="form-grid" novalidate>${SECRETS.map(([k, l]) => html`<div class="field"><label for="f_${k}">${l} ${data.secrets.configured[k] ? badge('active', 'Configured') : badge('inactive', 'Not set')}</label><input type="password" id="f_${k}" name="${k}" autocomplete="new-password" placeholder="${data.secrets.configured[k] ? '••••••••••••' : 'Paste value'}"></div>`)}
        <div class="full row"><button class="btn" type="submit">Save credentials</button><button class="btn ghost danger" type="button" id="clr">Remove all stored credentials</button></div></form>`) : card('Gateway credentials', html`<p class="muted">Only a super admin can change payment credentials.</p>`));
    const legal = async (pane) => {
      const keys = data.legalKeys; let key = keys[0];
      const draw = async () => {
        const r = await A.get(`/api/legal/${key}`);
        setHTML(pane, html`<form class="card" novalidate><div class="card-b stack"><div class="field"><label for="lk">Page</label><select id="lk">${keys.map((k) => html`<option value="${k}" ${k === key ? raw('selected') : ''}>${LEGAL_LABEL[k] || cap(k)}</option>`)}</select></div>
          <div class="field"><label for="lb">Text (blank lines make paragraphs)</label><textarea id="lb" rows="16">${r.body}</textarea><div class="help">Starter text only — have a lawyer review it before going live.</div></div></div><div class="card-h" style="border-top:1px solid var(--line);border-bottom:0"><a href="/${key.replace(/_/g, '-')}" target="_blank" rel="noopener">Preview page ${ic('external')}</a><button class="btn" type="submit">Save page</button></div></form>`);
        $('#lk', pane).addEventListener('change', (e) => { key = e.target.value; draw(); });
        $('form', pane).addEventListener('submit', async (e) => { e.preventDefault(); try { S.legal = (await A.put('/api/admin/settings/legal', { ...(S.legal || {}), [key]: { body: $('#lb', pane).value, updated: new Date().toISOString().slice(0, 10) } })).settings; toast('Page saved', 'ok'); } catch (err) { toast(err.message, 'err'); } });
      };
      try { await draw(); } catch (e) { toast(e.message, 'err'); }
    };
    on(el, 'click', '[data-tab]', (e, b) => { tab = TABS.find((t) => t.id === b.dataset.tab); history.replaceState({}, '', `/admin/settings?tab=${tab.id}`); paint(); });
    on(el, 'submit', '#sec', async (e, f) => {
      e.preventDefault(); const body = {}; SECRETS.forEach(([k]) => { const v = f.elements[k].value.trim(); if (v) body[k] = v; });
      if (!Object.keys(body).length) { toast('Nothing to save', 'err'); return; }
      try { await A.put('/api/admin/secrets', body); toast('Credentials saved securely', 'ok'); reload(); } catch (err) { toast(err.message, 'err'); }
    });
    on(el, 'click', '#clr', async () => { try { await A.put('/api/admin/secrets', Object.fromEntries(SECRETS.map(([k]) => [k, null]))); toast('Stored credentials removed', 'ok'); reload(); } catch (err) { toast(err.message, 'err'); } });
    paint();
  });
}
