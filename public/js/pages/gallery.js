import { html, setHTML, $, $$, img, emptyState, errorState, openLightbox } from '../ui.js';
import { get, qs } from '../api.js';
import { pageHero, sectionHead } from '../components.js';
import { beforeAfter, bindBeforeAfter } from '../helpers.js';
import { IMG } from '../images.js';

const label = (c) => String(c || 'All').replace(/[_-]/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());

export default async function gallery(ctx) {
  ctx.meta('Gallery', 'Photos and videos of our halls, wedding decorations and events.');
  setHTML(ctx.el, html`${pageHero({ title: 'Gallery', sub: 'A look inside our halls, decorations and events.', crumbs: [{ label: 'Gallery' }], image: IMG.ballroomTables })}
    <section class="section"><div class="container"><div class="masonry" aria-busy="true">${[220, 300, 260, 340, 240, 280].map((h) => html`<div class="skeleton" style="height:${h}px"></div>`)}</div></div></section>`);
  let data;
  try { data = await get('/api/gallery'); } catch (e) {
    if (!ctx.isCurrent()) return;
    setHTML(ctx.el, html`${pageHero({ title: 'Gallery', crumbs: [{ label: 'Gallery' }] })}<div class="container section">${errorState(e.message)}</div>`);
    $('[data-retry]', ctx.el)?.addEventListener('click', () => ctx.navigate(location.pathname + location.search));
    return;
  }
  if (!ctx.isCurrent()) return;
  const items = data.items || [];
  const categories = data.categories || [];
  const photos = items.filter((i) => i.media_type !== 'video' && !i.before_url);
  const videos = items.filter((i) => i.media_type === 'video');
  const ba = items.filter((i) => i.before_url);
  let cat = ctx.query.category || '';
  if (cat && !categories.some((c) => c.category === cat)) cat = '';

  const grid = () => {
    const list = photos.filter((p) => !cat || p.category === cat);
    return list.length
      ? html`<div class="masonry">${list.map((p, i) => html`<button type="button" class="g-item" data-i="${i}" aria-label="Open photo: ${p.title || p.alt || 'Gallery photo'}">${img(p.thumb_url || p.url, p.alt || p.title || '', { w: 700, sizes: '(max-width:700px) 100vw, 33vw', ar: i % 3 === 0 ? '4/5' : i % 3 === 1 ? '4/3' : '1/1' })}<span class="cap">${p.title || ''}</span></button>`)}</div>`
      : emptyState('No photos here yet', 'Please check another category.');
  };

  setHTML(ctx.el, html`${pageHero({ title: 'Gallery', sub: 'Real moments from our halls, decorations and events.', crumbs: [{ label: 'Gallery' }], image: photos[0]?.url || IMG.ballroomTables })}
    <section class="section"><div class="container">
      ${categories.length > 1 ? html`<div class="tag-row" role="group" aria-label="Filter by category" id="g-cats" style="margin-bottom:24px"><button type="button" class="chip" data-cat="" aria-pressed="${!cat}">All</button>${categories.map((c) => html`<button type="button" class="chip" data-cat="${c.category}" aria-pressed="${cat === c.category}">${label(c.category)} <small>(${c.c})</small></button>`)}</div>` : ''}
      <div id="g-grid" aria-live="polite">${grid()}</div></div></section>
    ${ba.length ? html`<section class="section alt"><div class="container">${sectionHead('Transformations', 'Before & after', 'Drag the slider to see how our team transforms the space.')}<div class="grid g2" id="g-ba">${ba.map((b) => beforeAfter(b))}</div></div></section>` : ''}
    ${videos.length ? html`<section class="section"><div class="container">${sectionHead('Videos', 'Event films', 'Highlights from recent celebrations.')}<div class="grid g3">${videos.map((v, i) => html`<button type="button" class="g-item gv" data-v="${i}" aria-label="Play video: ${v.title || 'Event video'}">${img(v.thumb_url || v.url, v.alt || v.title || '', { w: 700, sizes: '(max-width:700px) 100vw, 33vw', ar: '16/9' })}<span class="play" aria-hidden="true">▶</span><span class="cap" style="opacity:1">${v.title || ''}</span></button>`)}</div></div></section>` : ''}
    ${!items.length ? html`<div class="container section">${emptyState('Gallery coming soon', 'We are adding photos. Please check back shortly.')}</div>` : ''}`);

  const draw = () => { setHTML($('#g-grid', ctx.el), grid()); };
  $('#g-cats', ctx.el)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat;
    $$('#g-cats .chip', ctx.el).forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    history.replaceState({}, '', `/gallery${qs({ category: cat })}`); draw();
  });
  $('#g-grid', ctx.el).addEventListener('click', (e) => {
    const b = e.target.closest('.g-item'); if (!b) return;
    const list = photos.filter((p) => !cat || p.category === cat); openLightbox(list, Number(b.dataset.i));
  });
  $$('.gv', ctx.el).forEach((b) => b.addEventListener('click', () => openLightbox(videos, Number(b.dataset.v))));
  bindBeforeAfter(ctx.el);
}
