import { html, setHTML, $, errorState, fmtDate } from '../ui.js';
import { get } from '../api.js';
import { pageHero } from '../components.js';

const KEYS = { '/privacy-policy': 'privacy_policy', '/terms': 'terms', '/cancellation-policy': 'cancellation_policy', '/refund-policy': 'refund_policy', '/cookie-policy': 'cookie_policy' };

/** Turn plain text into safe blocks: h2 for short headings, ul for '- ' lines, p otherwise. */
function blocks(text) {
  return String(text || '').split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    const out = []; let list = []; let para = [];
    const flushList = () => { if (list.length) out.push(html`<ul>${list.map((l) => html`<li>${l}</li>`)}</ul>`); list = []; };
    const flushPara = () => { if (para.length) out.push(html`<p>${para.join(' ')}</p>`); para = []; };
    lines.forEach((l, i) => {
      if (l.startsWith('- ')) { flushPara(); list.push(l.slice(2)); }
      else if (i === 0 && lines.length > 1 && l.length < 60 && !/[.:;,]$/.test(l)) { out.push(html`<h2>${l}</h2>`); }
      else { flushList(); para.push(l); }
    });
    flushList(); flushPara(); return out;
  }).flat();
}

export default async function legal(ctx) {
  const key = KEYS[ctx.path.replace(/\/$/, '')];
  if (!key) { const m = await import('./notfound.js'); return m.default(ctx); }
  let d;
  try { d = await get(`/api/legal/${key}`); } catch (e) {
    ctx.meta('Policy', '');
    setHTML(ctx.el, html`${pageHero({ title: 'Policy', crumbs: [{ label: 'Policy' }] })}<div class="container section">${errorState(e.message)}</div>`);
    $('[data-retry]', ctx.el)?.addEventListener('click', () => ctx.navigate(ctx.path)); return;
  }
  if (!ctx.isCurrent()) return;
  ctx.meta(d.title, `${d.title} of ${d.business}.`);
  setHTML(ctx.el, html`${pageHero({ title: d.title, crumbs: [{ label: d.title }] })}
  <section class="section"><div class="container"><article class="prose">
    ${blocks(d.body)}
    ${d.tiers?.length ? html`<h2>Refund schedule</h2><div class="table-wrap"><table class="tbl"><caption class="sr-only">Refund by notice period</caption><thead><tr><th scope="col">Cancellation notice</th><th scope="col">Refund of amount paid</th></tr></thead><tbody>
      ${[...d.tiers].sort((a, b) => b.days_before - a.days_before).map((t) => html`<tr><td>${t.days_before > 0 ? `${t.days_before} days or more before the event` : 'Less than the notice above'}</td><td><b>${t.refund_pct}%</b></td></tr>`)}</tbody></table></div>` : ''}
    ${d.updated ? html`<p class="caption">Last updated ${fmtDate(d.updated)}</p>` : ''}
    <p><a href="/contact">Questions? Contact us</a></p></article></div></section>`);
}
