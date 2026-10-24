// Reusable data table: search, filters, sort, pagination, CSV export. Works client-side (rows) or server-side (load).
import { html, setHTML, $, A, ic, emptyBlock, errBlock, toCSV, downloadText, toast, badge } from './core.js';

const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/**
 * o: { columns:[{key,label,render(row),sort,csv,cls}], rows | load(params)->{rows,total}, pageSize, search, searchLabel,
 *      filters:[{name,label,options:[[v,l]]} | {name,label,type:'date'}], exportName, exportUrl(params)->url, empty:{title,text,cta},
 *      onRow(row), onAction(act,row,reload), toolbar: html }
 */
export function mountTable(host, o) {
  const st = { q: '', page: 1, sort: o.defaultSort || '', dir: 'asc', filters: {}, rows: o.rows || [], total: 0, busy: false };
  const size = o.pageSize || 20; const server = typeof o.load === 'function' && !o.fetchAll;
  const cols = o.columns;
  const filterHtml = (o.filters || []).map((f) => (f.type === 'date'
    ? html`<div class="field"><label for="tf_${f.name}">${f.label}</label><input type="date" id="tf_${f.name}" data-f="${f.name}"></div>`
    : html`<div class="field"><label for="tf_${f.name}">${f.label}</label><select id="tf_${f.name}" data-f="${f.name}"><option value="">All</option>${f.options.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></div>`));
  setHTML(host, html`<div class="toolbar" role="search">
      ${o.search === false ? '' : html`<div class="field grow"><label for="tq">${o.searchLabel || 'Search'}</label><input id="tq" type="search" placeholder="${o.searchPlaceholder || 'Type to search…'}" autocomplete="off"></div>`}
      ${filterHtml}${o.toolbar || ''}
      <button type="button" class="btn ghost sm" data-x="csv" aria-label="Export CSV">${ic('download')} CSV</button>
      ${o.exportUrl ? html`<button type="button" class="btn ghost sm" data-x="xls">${ic('download')} Excel</button><button type="button" class="btn ghost sm" data-x="pdf">${ic('pdf')} PDF</button>` : ''}
    </div><div class="tbl-wrap" data-body aria-live="polite"></div><div class="pager" data-pager></div>`);
  const body = $('[data-body]', host); const pager = $('[data-pager]', host);

  const view = () => { // client-side pipeline
    let r = st.rows;
    if (st.q) { const q = st.q.toLowerCase(); r = r.filter((x) => cols.some((c) => String(c.csv ? c.csv(x) : x[c.key] ?? '').toLowerCase().includes(q))); }
    for (const [k, v] of Object.entries(st.filters)) if (v) r = r.filter((x) => String(x[k]) === String(v));
    if (st.sort) { const c = cols.find((x) => x.key === st.sort); const g = (x) => (c?.csv ? c.csv(x) : x[st.sort]); r = [...r].sort((a, b) => { const A1 = g(a), B1 = g(b); const d = typeof A1 === 'number' && typeof B1 === 'number' ? A1 - B1 : String(A1 ?? '').localeCompare(String(B1 ?? ''), undefined, { numeric: true }); return st.dir === 'asc' ? d : -d; }); }
    return r;
  };
  let shown = [];
  const params = () => ({ q: st.q, page: st.page, pageSize: size, sort: st.sort, ...st.filters });

  function draw() {
    let total; if (server) { shown = st.rows; total = st.total; } else { const all = view(); total = all.length; shown = all.slice((st.page - 1) * size, st.page * size); }
    if (!shown.length) { setHTML(body, o.empty ? emptyBlock(o.empty.title, o.empty.text, o.empty.cta) : emptyBlock('Nothing here yet', st.q ? 'No results match your search.' : '')); setHTML(pager, ''); return; }
    const sortable = (c) => c.sort ?? (server ? false : true);
    setHTML(body, html`<table class="tbl"><thead><tr>${cols.map((c) => html`<th scope="col" class="${c.cls || ''}" ${st.sort === (c.sort || c.key) ? html`aria-sort="${st.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${sortable(c) ? html`<button type="button" data-sort="${c.sort || c.key}">${c.label}${st.sort === (c.sort || c.key) ? ic(st.dir === 'asc' || server ? 'chevU' : 'chevD') : ''}</button>` : c.label}</th>`)}</tr></thead>
      <tbody>${shown.map((r, i) => html`<tr data-i="${i}" class="${o.onRow ? 'clickable' : ''}" ${o.onRow ? html`tabindex="0"` : ''}>${cols.map((c) => html`<td class="${c.cls || ''}">${c.render ? c.render(r) : (r[c.key] ?? '')}</td>`)}</tr>`)}</tbody></table>`);
    const pages = Math.max(1, Math.ceil(total / size)); st.page = Math.min(st.page, pages);
    const from = (st.page - 1) * size + 1; const to = Math.min(total, st.page * size);
    setHTML(pager, html`<span>Showing ${from}–${to} of ${total}</span><span class="row"><button class="btn ghost sm" type="button" data-p="-1" ${st.page <= 1 ? 'disabled' : ''} aria-label="Previous page">${ic('chevL')}</button><span>Page ${st.page} / ${pages}</span><button class="btn ghost sm" type="button" data-p="1" ${st.page >= pages ? 'disabled' : ''} aria-label="Next page">${ic('chevR')}</button></span>`);
  }
  async function reload() {
    if (o.fetchAll) { if (st.busy) return; st.busy = true; try { st.rows = await o.fetchAll(); draw(); } catch (e) { if (e.status !== 401) { setHTML(body, errBlock(e.message)); $('[data-retry]', body)?.addEventListener('click', reload); } } finally { st.busy = false; } return; }
    if (!server) { draw(); return; }
    if (st.busy) return; st.busy = true; body.setAttribute('aria-busy', 'true');
    try { const r = await o.load(params()); st.rows = r.rows; st.total = r.total ?? r.rows.length; draw(); } catch (e) { if (e.status !== 401) { setHTML(body, errBlock(e.message)); $('[data-retry]', body)?.addEventListener('click', reload); setHTML(pager, ''); } } finally { st.busy = false; body.removeAttribute('aria-busy'); }
  }
  const refresh = () => (server ? reload() : draw());
  const reset = () => { st.page = 1; refresh(); };
  $('#tq', host)?.addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); reset(); }));
  host.addEventListener('change', (e) => { const f = e.target.dataset?.f; if (f) { st.filters[f] = e.target.value; reset(); } });
  host.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-sort]'); if (s) { const k = s.dataset.sort; if (st.sort === k && !server) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = k; st.dir = 'asc'; } reset(); return; }
    const p = e.target.closest('[data-p]'); if (p) { st.page += Number(p.dataset.p); refresh(); return; }
    const x = e.target.closest('[data-x]'); if (x) { await exportData(x.dataset.x); return; }
    const a = e.target.closest('[data-act]'); const tr = e.target.closest('tr[data-i]');
    if (a && tr) { e.stopPropagation(); o.onAction?.(a.dataset.act, shown[Number(tr.dataset.i)], reload); return; }
    if (tr && o.onRow && !e.target.closest('a,button,input,select,label')) o.onRow(shown[Number(tr.dataset.i)]);
  });
  host.addEventListener('keydown', (e) => { if (e.key === 'Enter' && o.onRow && e.target.matches('tr[data-i]')) o.onRow(shown[Number(e.target.dataset.i)]); });
  async function exportData(kind) {
    try {
      if (o.exportUrl) { const u = o.exportUrl({ ...params(), format: kind }); window.open(u, '_blank', 'noopener'); return; }
      const all = view(); const text = toCSV(all, cols.filter((c) => c.label).map((c) => ({ label: c.label, key: c.key, csv: c.csv || ((r) => r[c.key]) })));
      downloadText(`${o.exportName || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`, text); toast('Export downloaded', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }
  reload();
  return { reload, setRows(r) { st.rows = r; draw(); }, get rows() { return shown; } };
}
export { badge };
