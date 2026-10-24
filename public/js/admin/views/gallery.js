import { html, raw, setHTML, $, A, load, pageHead, ic, can, toast, badge, cap, emptyBlock, on } from '../core.js';
import { formModal } from '../forms.js';
import { confirmDialog, img } from '/js/ui.js';

const CATS = ['hall', 'wedding', 'event', 'decoration', 'catering', 'corporate', 'stage'];
export default async function gallery({ el }) {
  const halls = (await A.get('/api/halls')).halls; const allow = can('gallery.manage');
  const fields = [{ name: 'media_type', label: 'Type', type: 'select', options: [['image', 'Image'], ['video', 'Video (URL or MP4/YouTube link)']] }, { name: 'category', label: 'Category', type: 'select', options: CATS.map((c) => [c, cap(c)]) },
    { name: 'url', label: 'Image / video URL', type: 'image', required: true, help: 'Upload a file, or paste an Unsplash / YouTube / MP4 link.' }, { name: 'thumb_url', label: 'Thumbnail (optional, used for videos)', type: 'image' }, { name: 'before_url', label: '“Before” image (for decoration transformations)', type: 'image' },
    { name: 'title', label: 'Title' }, { name: 'alt', label: 'Alt text (accessibility)', required: true }, { name: 'hall_id', label: 'Hall', type: 'select', options: [['', 'Any'], ...halls.map((h) => [h.id, h.name])] }, { name: 'sort_order', label: 'Sort order', type: 'number' }, { name: 'is_active', label: 'Visible on website', type: 'checkbox', default: true, full: true }];
  const clean = (v) => { if (v.hall_id === '' || v.hall_id === undefined) delete v.hall_id; else v.hall_id = Number(v.hall_id); return v; };
  const run = async () => load(el, () => A.get('/api/admin/gallery'), ({ rows }, reload) => {
    setHTML(el, html`${pageHead({ title: 'Gallery', sub: 'Hall, wedding and event photos and videos shown on the website.', actions: allow ? html`<button class="btn" id="add" type="button">${ic('upload')} Add media</button>` : '' })}
      ${rows.length ? html`<div class="thumbs">${rows.map((r) => html`<figure class="thumb" style="margin:0">${r.media_type === 'video' ? html`<div class="ph" style="display:grid;place-items:center">${ic('image')} Video</div>` : img(r.thumb_url || r.url, r.alt, { w: 400 })}<figcaption class="meta"><b>${r.title || r.alt}</b><span class="row" style="gap:6px">${badge('grey', cap(r.category))}${r.is_active ? '' : badge('inactive')}${r.before_url ? badge('blue', 'Before/after') : ''}</span>${allow ? html`<span class="row"><button class="btn sm ghost" data-e="${r.id}" type="button">${ic('edit')} Edit</button><button class="btn sm danger" data-d="${r.id}" type="button" aria-label="Delete ${r.title || r.alt}">${ic('trash')}</button></span>` : ''}</figcaption></figure>`)}</div>` : emptyBlock('No media yet', 'Upload your first hall photo.')}`);
    $('#add', el)?.addEventListener('click', () => formModal({ title: 'Add media', wide: true, fields, onSave: async (v) => { await A.post('/api/admin/gallery', clean(v)); toast('Added', 'ok'); reload(); } }));
    on(el, 'click', '[data-e]', (e, b) => { const r = rows.find((x) => x.id === Number(b.dataset.e)); formModal({ title: 'Edit media', wide: true, fields, values: r, onSave: async (v) => { await A.put(`/api/admin/gallery/${r.id}`, clean(v)); toast('Saved', 'ok'); reload(); } }); });
    on(el, 'click', '[data-d]', async (e, b) => { if (await confirmDialog('Delete this item from the gallery?', { ok: 'Delete', danger: true })) { try { await A.del(`/api/admin/gallery/${b.dataset.d}`); toast('Deleted', 'ok'); reload(); } catch (err) { toast(err.message, 'err'); } } });
  });
  await run();
}
