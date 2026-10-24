// Tiny dependency-free SVG/HTML charts. One y-scale only, thin marks, recessive grid, hover tooltips, data-table fallback.
import { html, raw, esc, $, compact, money } from './core.js';

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
export const STATUS_COLOR = { confirmed: 'var(--good)', completed: 'var(--s3)', reserved: 'var(--info)', pending: 'var(--warn)', held: 'var(--warn)', cancelled: 'var(--crit)', rejected: 'var(--serious)', expired: 'var(--muted)',
  new: 'var(--warn)', contacted: 'var(--info)', follow_up: 'var(--s4)', converted: 'var(--good)', closed: 'var(--muted)', Paid: 'var(--good)', Pending: 'var(--warn)', Refunded: 'var(--s7)' };

const tipEl = () => document.getElementById('tip');
export function showTip(e, title, line) {
  const t = tipEl(); if (!t) return; t.innerHTML = `<b>${esc(title)}</b>${esc(line)}`; t.hidden = false;
  const w = t.offsetWidth; const x = Math.min(innerWidth - w - 12, e.clientX + 14); t.style.left = `${Math.max(8, x)}px`; t.style.top = `${e.clientY + 16}px`;
}
export const hideTip = () => { const t = tipEl(); if (t) t.hidden = true; };

const dataTable = (cols, rows) => html`<details class="dt"><summary>View as table</summary><div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => html`<th scope="col">${c}</th>`)}</tr></thead><tbody>${rows.map((r) => html`<tr>${r.map((v) => html`<td>${v}</td>`)}</tr>`)}</tbody></table></div></details>`;

/** Horizontal bars with direct value labels. items: [{label, value, color}] */
export function hbars(items, { fmt = (v) => v.toLocaleString('en-IN'), label = 'Value' } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length || items.every((i) => !i.value)) return html`<p class="muted">No data for this period yet.</p>`;
  return html`<div class="chart" data-hbars role="img" aria-label="Bar chart: ${items.map((i) => `${i.label} ${fmt(i.value)}`).join(', ')}">${items.map((i, k) => html`<div class="hbar" data-tt="${i.label}|${fmt(i.value)}"><span class="lbl" title="${i.label}">${i.label}</span><span class="track"><span class="fill" style="display:block;width:${(i.value / max) * 100}%;background:${raw(i.color || SERIES[k % 8])}"></span></span><span class="v">${fmt(i.value)}</span></div>`)}</div>
    ${dataTable(['Item', label], items.map((i) => [i.label, fmt(i.value)]))}`;
}

/** Line + area chart. points: [{label, value}]. Crosshair tooltip on hover. */
export function lineChart(points, { fmt = money, color = 'var(--s1)', label = 'Value', h = 220 } = {}) {
  if (!points.length || points.every((p) => !p.value)) return html`<p class="muted">No data for this period yet.</p>`;
  const W = 640; const pad = { l: 46, r: 14, t: 12, b: 26 }; const iw = W - pad.l - pad.r; const ih = h - pad.t - pad.b;
  const max = Math.max(...points.map((p) => p.value)) * 1.1 || 1; const n = points.length;
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw); const y = (v) => pad.t + ih - (v / max) * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${path}L${x(n - 1).toFixed(1)},${pad.t + ih}L${x(0).toFixed(1)},${pad.t + ih}Z`;
  const ticks = [0, .25, .5, .75, 1].map((f) => max * f);
  const every = Math.ceil(n / 8);
  const svg = `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="Line chart of ${esc(label)} over ${n} periods" data-line>
    ${ticks.map((t) => `<line class="grid-l" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(compact(t))}</text>`).join('')}
    ${points.map((p, i) => (i % every === 0 ? `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(p.label)}</text>` : '')).join('')}
    <path d="${area}" fill="${color}" opacity=".13"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="${n > 20 ? 0 : 3.5}" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`).join('')}
    <line class="axis" data-cross x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" style="display:none"/>
    ${points.map((p, i) => `<rect data-tt="${esc(p.label)}|${esc(fmt(p.value))}" data-cx="${x(i)}" x="${x(i) - iw / n / 2}" y="${pad.t}" width="${iw / n}" height="${ih}" fill="transparent"/>`).join('')}</svg>`;
  return html`<div class="chart">${raw(svg)}</div>${dataTable(['Period', label], points.map((p) => [p.label, fmt(p.value)]))}`;
}

/** One delegated hover handler for every chart inside root. */
export function bindChartTips(root) {
  root.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-tt]'); if (!t) { hideTip(); root.querySelectorAll('[data-cross]').forEach((c) => { c.style.display = 'none'; }); return; }
    const [a, b] = t.dataset.tt.split('|'); showTip(e, a, b);
    const cx = t.dataset.cx; const svg = t.closest('svg'); if (cx && svg) { const c = svg.querySelector('[data-cross]'); c.setAttribute('x1', cx); c.setAttribute('x2', cx); c.style.display = ''; }
  });
  root.addEventListener('pointerleave', hideTip);
}
export const $c = $;
