// Visual effects: 3D tilt (pointer), scroll reveal, parallax layers, image-failure placeholders.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let active = null;
function tilt(e) {
  if (reduced || e.pointerType === 'touch') return;
  const el = e.target.closest?.('[data-tilt]');
  if (active && active !== el) reset(active);
  if (!el) { active = null; return; }
  active = el; const r = el.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  const max = Number(el.dataset.tilt) || 7;
  el.classList.add('tilting');
  el.style.transform = `perspective(1000px) rotateX(${((0.5 - py) * max).toFixed(2)}deg) rotateY(${((px - 0.5) * max * 1.3).toFixed(2)}deg) translateZ(0)`;
  el.style.setProperty('--mx', `${px * 100}%`); el.style.setProperty('--my', `${py * 100}%`);
}
function reset(el) { el.classList.remove('tilting'); el.style.transform = ''; }
let io; let parallaxEls = []; let ticking = false;
function onScroll() {
  const hdr = document.getElementById('hdr'); if (hdr) hdr.classList.toggle('scrolled', window.scrollY > 24);
  if (ticking || reduced) return; ticking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY, vh = window.innerHeight;
    parallaxEls.forEach((el) => { const r = el.getBoundingClientRect(); if (r.bottom < -200 || r.top > vh + 200) return; const d = Number(el.dataset.depth) || 0.1; const off = (r.top + r.height / 2 - vh / 2) * -d; el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`; });
    const bg = document.querySelector('.hero-bg'); if (bg && y < 1400) bg.style.transform = `translate3d(0, ${(y * 0.28).toFixed(1)}px, 0) scale(1.08)`;
    ticking = false;
  });
}
export function afterRender() {
  io?.disconnect();
  io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
  parallaxEls = [...document.querySelectorAll('[data-depth]')]; onScroll();
}
export function initEffects() {
  document.addEventListener('pointermove', tilt, { passive: true });
  document.addEventListener('pointerleave', () => { if (active) { reset(active); active = null; } });
  window.addEventListener('scroll', onScroll, { passive: true });
  // CSP forbids inline onerror handlers; image error events do not bubble, so listen in the capture phase.
  document.addEventListener('error', (e) => { const t = e.target; if (t?.tagName === 'IMG') { t.classList.add('img-fail'); t.parentElement?.classList.add('img-fail'); } }, true);
  window.addEventListener('route:rendered', afterRender);
  // hero 3D parallax on pointer move
  document.addEventListener('pointermove', (e) => {
    const s = document.querySelector('.hero-3d'); if (!s || reduced || e.pointerType === 'touch') return;
    const r = s.parentElement.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width - 0.5), y = ((e.clientY - r.top) / r.height - 0.5);
    if (Math.abs(x) > 1.2 || Math.abs(y) > 1.4) return;
    s.style.transform = `rotateY(${(x * -9).toFixed(2)}deg) rotateX(${(y * 7).toFixed(2)}deg)`;
  }, { passive: true });
}
