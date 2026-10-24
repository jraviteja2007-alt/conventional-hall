// Form builder: declarative field specs -> escaped markup, typed collection, modal forms with per-field server errors, image upload.
import { html, raw, setHTML, A, toast, ic, on } from './core.js';
import { modal, showFieldErrors, esc } from '/js/ui.js';

/**
 * field spec: { name, label, type: text|email|tel|number|date|time|textarea|select|checkbox|image|lines|json|color|password|hidden,
 *               options:[[value,label]], required, help, placeholder, full, rows, num, min, max, step, nullable }
 */
export function field(f, v) {
  const t = f.type || 'text';
  const id = `f_${f.name}`;
  const val = v ?? f.default ?? '';
  const req = f.required ? raw(' <span class="req" aria-hidden="true">*</span>') : '';
  const attrs = raw([f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '', f.min !== undefined ? `min="${esc(f.min)}"` : '', f.max !== undefined ? `max="${esc(f.max)}"` : '', f.step ? `step="${esc(f.step)}"` : '', f.maxlength ? `maxlength="${esc(f.maxlength)}"` : '', f.disabled ? 'disabled' : '', f.autocomplete ? `autocomplete="${esc(f.autocomplete)}"` : ''].filter(Boolean).join(' '));
  let input;
  switch (t) {
    case 'hidden': return html`<input type="hidden" name="${f.name}" value="${val}">`;
    case 'textarea': input = html`<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${attrs}>${val}</textarea>`; break;
    case 'lines': input = html`<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}" ${attrs}>${Array.isArray(val) ? val.join('\n') : val}</textarea>`; break;
    case 'json': input = html`<textarea id="${id}" name="${f.name}" rows="${f.rows || 6}" class="mono" spellcheck="false" ${attrs}>${typeof val === 'string' ? val : JSON.stringify(val ?? [], null, 2)}</textarea>`; break;
    case 'select': input = html`<select id="${id}" name="${f.name}" ${attrs}>${(f.options || []).map(([ov, ol]) => html`<option value="${ov}" ${String(ov) === String(val) ? raw('selected') : ''}>${ol}</option>`)}</select>`; break;
    case 'checkbox': return html`<div class="field ${f.full ? 'full' : ''}"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${val === true || val === 1 || val === '1' ? raw('checked') : ''}> <span>${f.label}</span></label>${f.help ? html`<div class="help">${f.help}</div>` : ''}<div class="err"></div></div>`;
    case 'color': input = html`<div class="color-row"><input type="color" id="${id}" name="${f.name}" value="${/^#[0-9a-f]{6}$/i.test(val) ? val : '#000000'}"><code data-colorval>${val}</code></div>`; break;
    case 'image': input = html`<div class="imgfield"><input type="text" id="${id}" name="${f.name}" value="${val}" placeholder="https://... or upload" ${attrs}>
      <label class="btn sm ghost">${ic('upload')} Upload<input type="file" accept="image/png,image/jpeg,image/webp" data-upload="${f.name}" hidden></label>
      <div class="img-prev" data-prev="${f.name}">${val ? html`<img src="${val}" alt="">` : ''}</div></div>`; break;
    default: input = html`<input type="${t}" id="${id}" name="${f.name}" value="${val}" ${attrs}>`;
  }
  return html`<div class="field ${f.full || ['textarea', 'lines', 'json', 'image'].includes(t) ? 'full' : ''}"><label for="${id}">${f.label}${req}</label>${input}${f.help ? html`<div class="help">${f.help}</div>` : ''}<div class="err"></div></div>`;
}
export const fieldsHtml = (fields, values = {}) => html`${fields.map((f) => field(f, values[f.name]))}`;

/** Read typed values from a form. Returns { out, errs }. Empty optional values are omitted (or null when f.nullable). */
export function collect(form, fields) {
  const out = {}; const errs = {};
  for (const f of fields) {
    const t = f.type || 'text';
    const el = form.elements[f.name];
    if (!el) continue;
    if (t === 'checkbox') { out[f.name] = !!el.checked; continue; }
    const raw0 = String(el.value ?? '');
    const v = t === 'lines' || t === 'json' || t === 'textarea' ? raw0.trim() : raw0.trim();
    if (t === 'lines') { out[f.name] = v.split('\n').map((s) => s.trim()).filter(Boolean); continue; }
    if (t === 'json') {
      if (!v) { out[f.name] = []; continue; }
      try { out[f.name] = JSON.parse(v); } catch { errs[f.name] = 'Invalid JSON'; }
      continue;
    }
    if (v === '') { if (f.nullable) out[f.name] = null; continue; }
    if (t === 'number' || f.num) { const n = Number(v); if (Number.isNaN(n)) errs[f.name] = 'Enter a number'; else out[f.name] = n; continue; }
    out[f.name] = v;
  }
  return { out, errs };
}

export async function uploadImage(file) {
  if (!file) return null;
  const r = await A.raw('/api/admin/upload', { method: 'POST', raw: true, body: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) } });
  return r.url;
}

/** Wire up upload buttons + colour readouts inside a container. */
export function bindUploads(root) {
  root.addEventListener('change', async (e) => {
    const inp = e.target;
    if (inp.matches?.('input[type=color]')) { const c = inp.parentElement.querySelector('[data-colorval]'); if (c) c.textContent = inp.value; return; }
    if (!inp.matches?.('input[type=file][data-upload]')) return;
    const name = inp.dataset.upload; const file = inp.files?.[0]; if (!file) return;
    const label = inp.closest('label'); label?.classList.add('is-loading');
    try {
      const url = await uploadImage(file);
      const target = root.querySelector(`[name="${CSS.escape(name)}"]`);
      if (target) { target.value = url; target.dispatchEvent(new Event('input', { bubbles: true })); }
      const prev = root.querySelector(`[data-prev="${CSS.escape(name)}"]`); if (prev) setHTML(prev, html`<img src="${url}" alt="">`);
      toast('Image uploaded', 'ok');
    } catch (err) { toast(err.message || 'Upload failed', 'err'); } finally { label?.classList.remove('is-loading'); inp.value = ''; }
  });
  root.addEventListener('input', (e) => {
    const t = e.target; if (!t.matches?.('.imgfield input[type=text]')) return;
    const prev = root.querySelector(`[data-prev="${CSS.escape(t.name)}"]`);
    if (prev) setHTML(prev, /^(https?:)?\/\/|^\/media\//.test(t.value) ? html`<img src="${t.value}" alt="">` : '');
  });
}

/** Modal with a form. onSave(values, form) may throw ApiError (details shown per field). Resolves true if saved. */
export function formModal({ title, fields = [], values = {}, onSave, submit = 'Save', wide = false, intro = '', extra = '', danger = false, onOpen }) {
  const form = document.createElement('form');
  form.className = 'form-grid'; form.noValidate = true;
  setHTML(form, html`${intro}${fields.map((f) => field(f, values[f.name]))}${extra}`);
  bindUploads(form);
  const save = async () => {
    const { out, errs } = collect(form, fields);
    if (Object.keys(errs).length) { showFieldErrors(form, errs); return false; }
    try { const r = await onSave(out, form); return r !== false; } catch (e) {
      if (e.details && showFieldErrors(form, e.details)) { toast('Please fix the highlighted fields', 'err'); return false; }
      toast(e.message || 'Something went wrong', 'err'); return false;
    }
  };
  const m = modal({ title, body: form, wide, actions: [{ label: 'Cancel', cls: 'ghost', value: false }, { label: submit, cls: danger ? 'danger' : '', onClick: save, value: true }] });
  form.addEventListener('submit', (e) => { e.preventDefault(); m.el.querySelector('.ma .btn:last-child')?.click(); });
  onOpen?.(form, m);
  return m;
}

/** Show a one-off secret (e.g. temporary password) with a copy button. */
export function secretDialog(title, intro, label, value) {
  const body = html`<p>${intro}</p><div class="secret"><code id="secretval">${value}</code><button class="btn sm ghost" type="button" data-copy>${ic('copy')} Copy</button></div><p class="muted small">It is shown only once. Share it securely.</p>`;
  const node = document.createElement('div'); setHTML(node, body);
  on(node, 'click', '[data-copy]', async (e, b) => { try { await navigator.clipboard.writeText(value); b.textContent = 'Copied'; } catch { toast('Copy failed: select and copy manually', 'err'); } });
  return modal({ title, body: node, actions: [{ label: 'Done' }] });
}

/** Prompt for a single text value (e.g. reason). Resolves string|null. */
export function promptDialog({ title, label, placeholder = '', ok = 'Confirm', danger = false, multiline = true, value = '', required = false }) {
  let out = null;
  const body = document.createElement('form'); body.noValidate = true;
  setHTML(body, html`<div class="field"><label for="pr_v">${label}</label>${multiline ? html`<textarea id="pr_v" name="v" rows="3" placeholder="${placeholder}">${value}</textarea>` : html`<input id="pr_v" name="v" value="${value}" placeholder="${placeholder}">`}<div class="err"></div></div>`);
  const m = modal({
    title, body, actions: [{ label: 'Cancel', cls: 'ghost', value: false }, {
      label: ok, cls: danger ? 'danger' : '', value: true,
      onClick: () => { out = body.elements.v.value.trim(); if (required && !out) { showFieldErrors(body, { v: 'This field is required' }); return false; } return true; },
    }],
  });
  body.addEventListener('submit', (e) => { e.preventDefault(); m.el.querySelector('.ma .btn:last-child')?.click(); });
  return m.then((r) => (r ? out : null));
}
