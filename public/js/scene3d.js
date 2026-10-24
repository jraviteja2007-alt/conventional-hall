// Hall3D - a tiny dependency-free software 3D renderer (canvas 2D) that draws a "dollhouse" cut-away of a convention hall.
// Perspective camera, back-face culling, painter's algorithm, flat shading with warm chandelier lights, additive glow and drifting dust.
// Works offline, no WebGL needed, ~2-3k polygons at 60fps. Respects prefers-reduced-motion.

const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const PAL = {
  marble: hex('#b9a88f'), marble2: hex('#a1917a'), carpet: hex('#6e1a2e'), gold: hex('#d4a83f'), cloth: hex('#fbf6ec'), wood: hex('#7b5232'),
  wall: hex('#7a6350'), wallDark: hex('#5e4a3d'), maroon: hex('#6b1e2e'), flowerP: hex('#e9a3b5'), flowerW: hex('#fff4e8'), leaf: hex('#4d7a4f'),
  chair: hex('#e8d8b4'), chairBack: hex('#c9a24b'), stage: hex('#5b2230'), glass: hex('#ffd89a'), dark: hex('#2a2230'), navy: hex('#2b3a67'),
};

/* ---------- geometry builders: each returns faces {p:[pts], n, c:[r,g,b], e} ---------- */
function rot(p, cx, cz, a) {
  if (!a) return p;
  const s = Math.sin(a), c = Math.cos(a), x = p[0] - cx, z = p[2] - cz;
  return [cx + x * c + z * s, p[1], cz - x * s + z * c];
}
function rotN(n, a) { if (!a) return n; const s = Math.sin(a), c = Math.cos(a); return [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c]; }

function box(out, cx, y0, cz, w, h, d, color, ry = 0, e = 0) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
  const F = (pts, n) => out.push({ p: pts.map((q) => rot(q, cx, cz, ry)), n: rotN(n, ry), c: color, e });
  F([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]);
  F([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0]);
  F([[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], [-1, 0, 0]);
  F([[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], [0, 0, 1]);
  F([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]);
}
function cyl(out, cx, y0, cz, r, h, color, sides = 10, e = 0, r2 = r) {
  const y1 = y0 + h; const top = [];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2;
    out.push({
      p: [[cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r], [cx + Math.cos(a1) * r2, y1, cz + Math.sin(a1) * r2], [cx + Math.cos(a0) * r2, y1, cz + Math.sin(a0) * r2]],
      n: [Math.cos(am), 0.0, Math.sin(am)], c: color, e,
    });
    top.push([cx + Math.cos(a0) * r2, y1, cz + Math.sin(a0) * r2]);
  }
  out.push({ p: top, n: [0, 1, 0], c: color, e });
}
function pyramid(out, cx, y0, cz, w, d, h, color, e = 0) {
  const a = [cx - w / 2, y0, cz - d / 2], b = [cx + w / 2, y0, cz - d / 2], c = [cx + w / 2, y0, cz + d / 2], dd = [cx - w / 2, y0, cz + d / 2], t = [cx, y0 + h, cz];
  [[a, b, t], [b, c, t], [c, dd, t], [dd, a, t]].forEach((tri, i) => {
    const n = v3.norm(v3.cross(v3.sub(tri[1], tri[0]), v3.sub(tri[2], tri[0])));
    const mid = [(tri[0][0] + tri[1][0]) / 2 - cx, 0, (tri[0][2] + tri[1][2]) / 2 - cz];
    out.push({ p: tri, n: v3.dot(n, mid) < 0 ? [-n[0], -n[1], -n[2]] : n, c: i % 2 ? mix(color, PAL.gold, 0.45) : color, e });
  });
}

function chair(out, x, z, ry, color = PAL.chair) {
  box(out, x, 0.0, z, 0.46, 0.45, 0.46, color, ry);
  const bx = x + Math.sin(ry) * 0.2 * -1, bz = z + Math.cos(ry) * 0.2 * -1;
  box(out, x - Math.sin(ry) * 0.21, 0.45, z - Math.cos(ry) * 0.21, 0.46, 0.5, 0.07, PAL.chairBack, ry);
  void bx; void bz;
}
function roundTable(out, x, z, chairs = 6, accent = PAL.gold) {
  cyl(out, x, 0, z, 0.22, 0.72, PAL.cloth, 8);
  cyl(out, x, 0.72, z, 1.05, 0.06, PAL.cloth, 14);
  cyl(out, x, 0.78, z, 0.13, 0.32, accent, 6, 0.15);
  box(out, x, 1.1, z, 0.3, 0.1, 0.3, PAL.flowerP, 0.4);
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * Math.PI * 2 + 0.3;
    chair(out, x + Math.cos(a) * 1.45, z + Math.sin(a) * 1.45, -a + Math.PI / 2 * 0 - Math.PI / 2 + Math.PI);
  }
}

function mandap(out, cx, y0, cz) {
  const s = 1.7;
  cyl(out, cx, y0, cz, 2.9, 0.18, PAL.carpet, 4, 0, 2.9); // base
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => {
    cyl(out, cx + i * s, y0 + 0.18, cz + j * s, 0.16, 3.2, PAL.gold, 8, 0.1);
    cyl(out, cx + i * s, y0 + 3.2, cz + j * s, 0.28, 0.14, PAL.gold, 8, 0.1);
    for (let k = 0; k < 4; k++) box(out, cx + i * s, y0 + 0.5 + k * 0.7, cz + j * s, 0.34, 0.2, 0.34, k % 2 ? PAL.flowerP : PAL.flowerW, k);
  });
  box(out, cx, y0 + 3.3, cz, 4.0, 0.14, 4.0, PAL.gold, 0, 0.1);
  pyramid(out, cx, y0 + 3.44, cz, 4.3, 4.3, 1.5, PAL.maroon, 0.05);
  // garland drapes
  for (let i = 0; i < 9; i++) box(out, cx - 1.6 + i * 0.4, y0 + 3.0 - Math.sin((i / 8) * Math.PI) * 0.35, cz + s + 0.05, 0.3, 0.16, 0.12, i % 2 ? PAL.flowerP : PAL.flowerW);
  // seating
  box(out, cx - 0.55, y0 + 0.18, cz, 0.7, 0.6, 0.7, PAL.gold, 0, 0.06);
  box(out, cx + 0.55, y0 + 0.18, cz, 0.7, 0.6, 0.7, PAL.gold, 0, 0.06);
  box(out, cx - 0.55, y0 + 0.78, cz - 0.3, 0.7, 0.9, 0.1, PAL.maroon);
  box(out, cx + 0.55, y0 + 0.78, cz - 0.3, 0.7, 0.9, 0.1, PAL.maroon);
}

function floralArch(out, cx, y0, cz, r, tilt = 0) {
  for (let i = 0; i <= 22; i++) {
    const a = (i / 22) * Math.PI;
    const x = cx + Math.cos(a) * r, y = y0 + Math.sin(a) * r * 0.9;
    box(out, x, y, cz, 0.55, 0.5, 0.5, i % 3 === 0 ? PAL.flowerW : i % 3 === 1 ? PAL.flowerP : PAL.leaf, i * 0.3);
  }
  void tilt;
}

function chandelier(out, lights, x, y, z, sc = 1, H = 9) {
  cyl(out, x, y + 0.6 * sc, z, 0.03, Math.max(0.5, H - y - 0.6 * sc), PAL.gold, 4);
  cyl(out, x, y + 0.3 * sc, z, 0.7 * sc, 0.12, PAL.gold, 12, 0.25);
  cyl(out, x, y, z, 0.42 * sc, 0.3, PAL.glass, 10, 0.9, 0.7 * sc);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; lights.glow.push([x + Math.cos(a) * 0.62 * sc, y + 0.45 * sc, z + Math.sin(a) * 0.62 * sc, 0.55]); }
  lights.glow.push([x, y + 0.2, z, 1.6]);
  lights.point.push({ p: [x, y, z], i: 1.5, r: 9 * sc });
}

function pillar(out, x, z, h) {
  box(out, x, 0, z, 1.1, 0.35, 1.1, PAL.marble2);
  cyl(out, x, 0.35, z, 0.42, h - 0.9, PAL.marble, 12);
  box(out, x, h - 0.55, z, 1.0, 0.55, 1.0, PAL.gold, 0, 0.1);
}

/* ---------- hall layout builders ---------- */
export function buildHall({ layout = 'banquet', capacity = 600, length = 40, width = 26, withMandap = true } = {}) {
  const maxDim = 44; const k = maxDim / Math.max(length, width * 1.2);
  const L = clamp(length * k, 24, 46), W = clamp(width * k, 16, 32), H = clamp(8.2 * (0.7 + 0.3 * (W / 26)), 6.5, 9);
  const faces = [], floor = [], walls = [];
  const lights = { glow: [], point: [] };
  const zBack = -L / 2, zFront = L / 2, xL = -W / 2, xR = W / 2;

  // floor: ivory marble checker with a carpet aisle
  const nx = 12, nz = 18;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = xL + (W / nx) * i, x1 = x0 + W / nx, z0 = zBack + (L / nz) * j, z1 = z0 + L / nz;
    const mid = (x0 + x1) / 2;
    const aisle = Math.abs(mid) < 1.4 && layout !== 'ushape';
    const c = aisle ? PAL.carpet : (i + j) % 2 ? PAL.marble : PAL.marble2;
    floor.push({ p: [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], n: [0, 1, 0], c, e: 0 });
  }
  // walls (inside-facing; back-face culling reveals the dollhouse cut-away automatically)
  const wallCol = PAL.wall;
  const wall = (pts, n, c = wallCol, e = 0) => walls.push({ p: pts, n, c, e });
  wall([[xL, 0, zBack], [xR, 0, zBack], [xR, H, zBack], [xL, H, zBack]], [0, 0, 1], PAL.wallDark);
  wall([[xL, 0, zFront], [xL, 0, zBack], [xL, H, zBack], [xL, H, zFront]], [1, 0, 0]);
  wall([[xR, 0, zBack], [xR, 0, zFront], [xR, H, zFront], [xR, H, zBack]], [-1, 0, 0]);
  wall([[xR, 0, zFront], [xL, 0, zFront], [xL, H, zFront], [xR, H, zFront]], [0, 0, -1]);
  // wall dados + windows (emissive panels)
  for (let i = 0; i < 6; i++) {
    const z = zBack + 4 + i * ((L - 8) / 5);
    walls.push({ p: [[xL + 0.02, 1.6, z - 1.2], [xL + 0.02, 1.6, z + 1.2], [xL + 0.02, H - 1.6, z + 1.2], [xL + 0.02, H - 1.6, z - 1.2]], n: [1, 0, 0], c: PAL.glass, e: 0.55 });
    walls.push({ p: [[xR - 0.02, 1.6, z + 1.2], [xR - 0.02, 1.6, z - 1.2], [xR - 0.02, H - 1.6, z - 1.2], [xR - 0.02, H - 1.6, z + 1.2]], n: [-1, 0, 0], c: PAL.glass, e: 0.55 });
    pillar(faces, xL + 0.9, z + 2.1, H);
    pillar(faces, xR - 0.9, z + 2.1, H);
  }

  // stage
  const stageD = Math.min(7, L * 0.17), stageW = W - 5;
  box(faces, 0, 0, zBack + stageD / 2 + 0.2, stageW, 1.0, stageD, PAL.stage);
  box(faces, 0, 1.0, zBack + stageD / 2 + 0.2, stageW - 0.4, 0.05, stageD - 0.4, PAL.carpet);
  box(faces, 0, 1.05, zBack + stageD + 0.9, 4.0, 0.15, 1.6, PAL.carpet); // steps
  box(faces, 0, 1.0, zBack + 0.35, stageW - 1, 4.6, 0.3, PAL.maroon, 0, 0.05); // backdrop
  box(faces, 0, 5.6, zBack + 0.34, stageW - 0.4, 0.22, 0.34, PAL.gold, 0, 0.12);
  floralArch(faces, 0, 1.1, zBack + 0.75, Math.min(5.2, stageW / 2 - 0.5));
  if (withMandap) mandap(faces, 0, 1.05, zBack + stageD / 2 + 0.7);
  [-1, 1].forEach((s) => { cyl(faces, s * (stageW / 2 - 0.5), 1.0, zBack + 1.2, 0.35, 2.6, PAL.gold, 8, 0.1); box(faces, s * (stageW / 2 - 0.5), 3.6, zBack + 1.2, 0.8, 0.5, 0.8, PAL.flowerP); });

  // seating zone
  const z0 = zBack + stageD + 3.6, z1 = zFront - 2.2, zoneL = z1 - z0, zoneW = W - 3.6;
  const drawn = (n, cap) => Math.max(1, Math.round(n));
  if (layout === 'theatre' || layout === 'classroom') {
    const rows = Math.max(3, Math.min(layout === 'theatre' ? 14 : 9, Math.floor(zoneL / (layout === 'theatre' ? 1.05 : 1.7))));
    const perSide = Math.max(3, Math.min(layout === 'theatre' ? 9 : 5, Math.round(capacity / rows / 2 / (layout === 'theatre' ? 4.5 : 3.2))));
    const cols = Math.min(Math.floor((zoneW - 3) / 2 / 0.62), perSide + 2);
    for (let r = 0; r < rows; r++) {
      const z = z0 + r * (zoneL / rows);
      for (const side of [-1, 1]) for (let c = 0; c < cols; c++) {
        const x = side * (1.6 + c * 0.62);
        if (layout === 'classroom') { if (c % 2 === 0) box(faces, x + side * 0.31, 0, z, 1.2, 0.74, 0.5, PAL.wood); chair(faces, x, z + 0.6, Math.PI); } else chair(faces, x, z, Math.PI);
      }
    }
  } else if (layout === 'ushape') {
    const uw = Math.min(zoneW - 4, 11), ul = Math.min(zoneL - 2, 16), zc = z0 + 1.5;
    [-1, 1].forEach((s) => { box(faces, s * uw / 2, 0, zc + ul / 2, 1.2, 0.76, ul, PAL.wood); for (let i = 0; i < Math.floor(ul / 1.1); i++) chair(faces, s * (uw / 2 + 1.2 * -s * -1), zc + 0.6 + i * 1.1, s > 0 ? -Math.PI / 2 : Math.PI / 2); });
    box(faces, 0, 0, zc, uw + 1.2, 0.76, 1.2, PAL.wood);
    for (let i = 0; i < 9; i++) chair(faces, -uw / 2 + 0.5 + i * (uw / 9), zc - 1.1, 0);
  } else if (layout === 'dining') {
    const rows = Math.max(2, Math.min(7, Math.round(capacity / 150)));
    for (let r = 0; r < rows; r++) for (const side of [-1, 1]) {
      const z = z0 + 0.8 + r * (zoneL / rows), x = side * (zoneW / 4);
      box(faces, x, 0, z + 1.4, zoneW / 2.4, 0.78, 1.0, PAL.cloth);
      for (let c = 0; c < 8; c++) { chair(faces, x - (zoneW / 2.4) / 2 + 0.7 + c * ((zoneW / 2.4 - 1.2) / 7), z + 0.3, 0); chair(faces, x - (zoneW / 2.4) / 2 + 0.7 + c * ((zoneW / 2.4 - 1.2) / 7), z + 2.5, Math.PI); }
    }
    for (let i = 0; i < 3; i++) box(faces, -zoneW / 2 + 1 + i * 2.2, 0, zFront - 1.6, 2, 0.9, 0.8, PAL.gold, 0, 0.05); // buffet counters
  } else { // banquet rounds
    const maxTables = clamp(Math.round(capacity / 10), 8, 26);
    const colsMax = Math.max(3, Math.floor(zoneW / 3.9));
    const rowsMax = Math.max(2, Math.floor(zoneL / 3.9));
    let cols = Math.min(colsMax, Math.ceil(Math.sqrt(maxTables * (zoneW / zoneL))));
    cols = Math.max(2, cols);
    const rows = Math.min(rowsMax, Math.ceil(maxTables / cols));
    let n = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols && n < maxTables; c++) {
      const x = -zoneW / 2 + (zoneW / cols) * (c + 0.5), z = z0 + (zoneL / rows) * (r + 0.5);
      if (Math.abs(x) < 1.7) continue; // keep the aisle clear
      roundTable(faces, x, z, 6, (r + c) % 2 ? PAL.gold : PAL.flowerP); n++;
    }
  }

  // chandeliers
  const nc = Math.max(3, Math.round(L / 9));
  for (let i = 0; i < nc; i++) { const z = zBack + 6 + i * ((L - 9) / Math.max(1, nc - 1)); chandelier(faces, lights, 0, H - 2.2, z, 1.25, H); if (W > 22) { chandelier(faces, lights, -W / 4, H - 1.7, z + 2, 0.8, H); chandelier(faces, lights, W / 4, H - 1.7, z + 2, 0.8, H); } }
  lights.glow.push([0, 4.2, zBack + 1.6, 3.2]); // stage wash
  lights.point.push({ p: [0, 4, zBack + 3], i: 1.2, r: 14 });

  return { faces, floor, walls, lights, dims: { L, W, H } };
}

/* ---------- renderer ---------- */
export class Hall3D {
  constructor(canvas, opts = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d', { alpha: true });
    this.opts = { interactive: true, autorotate: true, layout: 'banquet', capacity: 600, length: 40, width: 26, bg: null, ...opts };
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
    this.yaw = -0.5; this.pitch = 0.62; this.dist = 1; this.userYaw = 0; this.userPitch = 0; this.zoom = 1;
    this.mx = 0; this.my = 0; this.running = false; this.visible = true; this.t0 = performance.now(); this.times = [];
    this.sun = v3.norm([-0.4, 1, 0.5]);
    this.dust = Array.from({ length: 46 }, () => [Math.random(), Math.random(), Math.random(), Math.random() * 0.6 + 0.2]);
    this.setLayout(this.opts);
    this._bind();
    this.resize();
    this.start();
  }
  setLayout(o) {
    Object.assign(this.opts, o);
    this.model = buildHall(this.opts);
    const d = this.model.dims; this.target = [0, d.H * 0.1, d.L * 0.02]; this.baseDist = Math.max(d.L * 1.42, d.W * 2.15);
    this.static = [...this.model.faces];
    if (!this.running && this.w) this.frame(performance.now());
  }
  _bind() {
    const c = this.c;
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(c);
    this._io = new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; this._tick(); }); this._io.observe(c);
    this._vis = () => this._tick(); document.addEventListener('visibilitychange', this._vis);
    if (!this.opts.interactive) return;
    c.style.touchAction = 'pan-y'; c.style.cursor = 'grab';
    let drag = null;
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'; this.interacted = performance.now(); });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect(); this.mx = ((e.clientX - r.left) / r.width - 0.5) * 2; this.my = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!drag) return;
      this.userYaw -= (e.clientX - drag.x) * 0.006; this.userPitch = clamp(this.userPitch + (e.clientY - drag.y) * 0.004, -0.45, 0.5);
      drag.x = e.clientX; drag.y = e.clientY; this.interacted = performance.now();
      if (!this.running) this.frame(performance.now());
    });
    const end = () => { drag = null; c.style.cursor = 'grab'; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.mx = 0; this.my = 0; });
    c.setAttribute('tabindex', '0');
    c.addEventListener('keydown', (e) => {
      const k = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[e.key];
      if (k) { e.preventDefault(); this.userYaw += k[0]; this.userPitch = clamp(this.userPitch + k[1], -0.45, 0.5); this.interacted = performance.now(); if (!this.running) this.frame(performance.now()); }
    });
  }
  zoomBy(f) { this.zoom = clamp(this.zoom * f, 0.65, 1.5); if (!this.running) this.frame(performance.now()); }
  resetView() { this.userYaw = 0; this.userPitch = 0; this.zoom = 1; if (!this.running) this.frame(performance.now()); }
  resize() {
    const r = this.c.getBoundingClientRect(); const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    this.w = w; this.h = h; this.c.width = Math.round(w * this.dpr); this.c.height = Math.round(h * this.dpr);
    if (!this.running) this.frame(performance.now());
  }
  start() { this._tick(); }
  _tick() {
    const should = this.visible && !document.hidden && !this.destroyed;
    if (should && !this.running) { this.running = true; const loop = (t) => { if (!this.running) return; this.frame(t); this._raf = requestAnimationFrame(loop); }; this._raf = requestAnimationFrame(loop); }
    if (!should && this.running) { this.running = false; cancelAnimationFrame(this._raf); }
  }
  destroy() {
    this.destroyed = true; this.running = false; cancelAnimationFrame(this._raf); this._ro.disconnect(); this._io.disconnect(); document.removeEventListener('visibilitychange', this._vis);
  }

  frame(now) {
    const t0 = performance.now();
    const { ctx, w, h } = this; const T = (now - this.t0) / 1000;
    const idle = !this.interacted || now - this.interacted > 4000;
    const auto = this.opts.autorotate && !this.reduced && idle ? Math.sin(T * 0.22) * 0.5 : 0;
    const yaw = this.yaw + this.userYaw + auto + this.mx * 0.12, pitch = clamp(this.pitch + this.userPitch - this.my * 0.05, 0.28, 1.15);
    const dist = this.baseDist / this.zoom;
    const tg = this.target;
    const cam = [tg[0] + Math.sin(yaw) * Math.cos(pitch) * dist, tg[1] + Math.sin(pitch) * dist, tg[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
    const f = v3.norm(v3.sub(tg, cam)); const right = v3.norm(v3.cross(f, [0, 1, 0])); const up = v3.cross(right, f);
    const focal = (h / 2) / Math.tan((38 * Math.PI) / 360) * (w / h < 1 ? 0.8 : 1);
    const cx = w / 2, cy = h / 2 + h * 0.03;
    const proj = (p) => { const rx = p[0] - cam[0], ry = p[1] - cam[1], rz = p[2] - cam[2]; const z = rx * f[0] + ry * f[1] + rz * f[2]; if (z < 0.5) return null; return [cx + ((rx * right[0] + ry * right[1] + rz * right[2]) / z) * focal, cy - ((rx * up[0] + ry * up[1] + rz * up[2]) / z) * focal, z]; };

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const lights = this.model.lights;
    const fog = hex('#1b1420');
    const lit = (face, z) => {
      const n = face.n; const cn = face.cc || (face.cc = [(face.p[0][0] + face.p[2][0]) / 2, (face.p[0][1] + face.p[2][1]) / 2, (face.p[0][2] + face.p[2][2]) / 2]);
      let L = 0.36 + 0.2 * Math.max(0, v3.dot(n, this.sun));
      let warm = 0;
      for (const l of lights.point) { const dx = l.p[0] - cn[0], dy = l.p[1] - cn[1], dz = l.p[2] - cn[2]; const d2 = dx * dx + dy * dy + dz * dz; const d = Math.sqrt(d2) || 1; const ndl = Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / d); warm += (l.i * (0.25 + ndl)) / (1 + d2 / (l.r * l.r)) * 0.55; }
      L += Math.min(0.55, warm * 0.32);
      let c = face.c; const k = L; let r = c[0] * k * (1 + warm * 0.08), g = c[1] * k * (1 + warm * 0.02), b = c[2] * k * (1 - warm * 0.05);
      if (face.e) { r += (255 - r) * face.e * 0.55; g += (214 - g) * face.e * 0.55; b += (150 - b) * face.e * 0.4; }
      const fg = clamp((z - this.baseDist * 0.7) / (this.baseDist * 1.6), 0, 0.28);
      r += (fog[0] - r) * fg; g += (fog[1] - g) * fg; b += (fog[2] - b) * fg;
      return `rgb(${clamp(r, 0, 255) | 0},${clamp(g, 0, 255) | 0},${clamp(b, 0, 255) | 0})`;
    };
    const draw = (face) => {
      const cn = face.cc || (face.cc = [(face.p[0][0] + face.p[2][0]) / 2, (face.p[0][1] + face.p[2][1]) / 2, (face.p[0][2] + face.p[2][2]) / 2]);
      if (face.n[0] * (cam[0] - cn[0]) + face.n[1] * (cam[1] - cn[1]) + face.n[2] * (cam[2] - cn[2]) <= 0) return null;
      const pts = []; let zs = 0;
      for (const p of face.p) { const q = proj(p); if (!q) return null; pts.push(q); zs += q[2]; }
      return { pts, z: zs / pts.length, face };
    };
    const paint = (d) => {
      const { pts, face, z } = d; const col = lit(face, z);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke();
    };
    // 1. floor, 2. walls (always behind everything visible), 3. sorted objects
    for (const fl of this.model.floor) { const d = draw(fl); if (d) paint(d); }
    const wl = []; for (const wv of this.model.walls) { const d = draw(wv); if (d) wl.push(d); }
    wl.sort((a, b) => b.z - a.z); wl.forEach(paint);
    const objs = []; for (const o of this.static) { const d = draw(o); if (d) objs.push(d); }
    objs.sort((a, b) => b.z - a.z); for (const o of objs) paint(o);

    // additive glow
    ctx.globalCompositeOperation = 'lighter';
    for (const g of lights.glow) {
      const q = proj(g); if (!q) continue; const r = (g[3] * focal) / q[2] * (0.85 + 0.15 * Math.sin(T * 2 + g[0] * 3));
      const gr = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 2.2);
      gr.addColorStop(0, 'rgba(255,224,160,0.42)'); gr.addColorStop(0.3, 'rgba(255,190,110,0.1)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q[0], q[1], r * 2.2, 0, 7); ctx.fill();
    }
    // drifting dust motes
    const d = this.model.dims;
    for (const m of this.dust) {
      const y = ((m[1] + T * 0.012 * m[3]) % 1) * d.H; const p = [(m[0] - 0.5) * d.W, y, (m[2] - 0.5) * d.L + Math.sin(T * 0.3 + m[0] * 9) * 0.5];
      const q = proj(p); if (!q) continue; const r = Math.max(0.8, (0.07 * focal) / q[2]);
      ctx.fillStyle = `rgba(255,226,170,${0.25 + 0.35 * m[3]})`; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // adaptive quality
    this.times.push(performance.now() - t0); if (this.times.length > 40) { const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length; this.times = []; if (avg > 20 && this.dpr > 1) { this.dpr = Math.max(1, this.dpr - 0.25); this.resize(); } }
  }
}
