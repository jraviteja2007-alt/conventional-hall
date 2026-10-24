// Tiny PDF writer (A4, Helvetica / Helvetica-Bold, WinAnsi). Enough for invoices, receipts and quotes.
const W = 595, H = 842;
const widthOf = (s, size, bold) => {
  let w = 0;
  for (const ch of s) {
    if (/[0-9]/.test(ch)) w += 0.556; else if (ch === ' ') w += 0.278; else if (/[A-Z]/.test(ch)) w += 0.68;
    else if (/[a-z]/.test(ch)) w += 0.5; else if (/[.,:;'|!]/.test(ch)) w += 0.28; else w += 0.55;
  }
  return w * size * (bold ? 1.06 : 1);
};
const latin = (s) => String(s ?? '').replace(/₹/g, 'Rs. ').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
const esc = (s) => latin(s).replace(/[\\()]/g, '\\$&');

export class Pdf {
  constructor() { this.pages = []; this.newPage(); }
  newPage() { this.ops = []; this.pages.push(this.ops); this.y = H - 50; return this; }
  color(c) { return c.map((v) => (v / 255).toFixed(3)).join(' '); }
  text(x, y, str, { size = 10, bold = false, color = [30, 30, 30], align = 'left', maxWidth } = {}) {
    let s = latin(str);
    if (maxWidth) while (s.length > 1 && widthOf(s, size, bold) > maxWidth) s = s.slice(0, -2) + '…'.replace('…', '.');
    const w = widthOf(s, size, bold);
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${this.color(color)} rg ${px.toFixed(1)} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`);
    return this;
  }
  rect(x, y, w, h, { fill, stroke } = {}) {
    if (fill) this.ops.push(`${this.color(fill)} rg ${x} ${y} ${w} ${h} re f`);
    if (stroke) this.ops.push(`${this.color(stroke)} RG 0.6 w ${x} ${y} ${w} ${h} re S`);
    return this;
  }
  line(x1, y1, x2, y2, c = [210, 210, 210]) { this.ops.push(`${this.color(c)} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`); return this; }
  wrap(x, y, str, { size = 10, width = 400, lead = 14, ...o } = {}) {
    const words = latin(str).split(/\s+/); let line = '', yy = y;
    for (const w of words) {
      if (widthOf((line + ' ' + w).trim(), size) > width) { this.text(x, yy, line, { size, ...o }); yy -= lead; line = w; } else line = (line + ' ' + w).trim();
    }
    if (line) { this.text(x, yy, line, { size, ...o }); yy -= lead; }
    return yy;
  }
  build() {
    const objs = []; const add = (s) => { objs.push(Buffer.from(s, 'latin1')); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('PAGES'); // placeholder, replaced below
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const ops of this.pages) {
      const content = Buffer.from(ops.join('\n'), 'latin1');
      const cid = objs.length + 1;
      objs.push(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]));
      const pid = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`);
      kids.push(`${pid} 0 R`);
    }
    objs[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`);
    const parts = [Buffer.from('%PDF-1.4\n')]; const offsets = []; let len = parts[0].length;
    objs.forEach((o, i) => {
      offsets.push(len);
      const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
      parts.push(chunk); len += chunk.length;
    });
    let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF`;
    parts.push(Buffer.from(xref));
    return Buffer.concat(parts);
  }
}
export { W as PAGE_W, H as PAGE_H };
