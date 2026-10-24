import { all, get, run } from '../db.js';
import { Pdf, PAGE_W } from '../lib/pdf.js';
import { setting } from './settings.js';

const GOLD = [168, 129, 41], NAVY = [14, 26, 58], GREY = [110, 110, 110];
const inr = (n) => 'Rs. ' + Number(n).toLocaleString('en-IN');

function header(pdf, title, number, date) {
  const biz = setting('business');
  pdf.rect(0, 772, PAGE_W, 70, { fill: NAVY });
  pdf.text(40, 810, biz.name, { size: 20, bold: true, color: [255, 255, 255] });
  pdf.text(40, 790, `${biz.address}`, { size: 8, color: [220, 220, 220], maxWidth: 380 });
  pdf.text(PAGE_W - 40, 810, title, { size: 16, bold: true, color: [232, 201, 135], align: 'right' });
  pdf.text(PAGE_W - 40, 792, number, { size: 9, color: [255, 255, 255], align: 'right' });
  pdf.text(PAGE_W - 40, 780, date, { size: 8, color: [220, 220, 220], align: 'right' });
  return 740;
}
function footer(pdf, note) {
  const biz = setting('business');
  pdf.line(40, 70, PAGE_W - 40, 70);
  pdf.text(40, 55, `${biz.phone}  |  ${biz.email}`, { size: 8, color: GREY });
  pdf.text(PAGE_W - 40, 55, note || 'This is a computer-generated document.', { size: 8, color: GREY, align: 'right' });
}
function table(pdf, y, rows, { total } = {}) {
  pdf.rect(40, y - 6, PAGE_W - 80, 22, { fill: [245, 240, 228] });
  pdf.text(48, y, 'Description', { size: 9, bold: true, color: NAVY });
  pdf.text(PAGE_W - 48, y, 'Amount', { size: 9, bold: true, color: NAVY, align: 'right' });
  y -= 24;
  for (const r of rows) {
    pdf.text(48, y, r.label, { size: 9.5, maxWidth: 400, bold: !!r.bold, color: r.amount < 0 ? [31, 138, 91] : [30, 30, 30] });
    pdf.text(PAGE_W - 48, y, r.amount < 0 ? '- ' + inr(-r.amount) : inr(r.amount), { size: 9.5, align: 'right', bold: !!r.bold });
    pdf.line(40, y - 7, PAGE_W - 40, y - 7, [235, 235, 235]); y -= 22;
  }
  if (total) {
    pdf.rect(PAGE_W - 240, y - 8, 200, 26, { fill: NAVY });
    pdf.text(PAGE_W - 230, y, total.label, { size: 10, bold: true, color: [255, 255, 255] });
    pdf.text(PAGE_W - 48, y, inr(total.amount), { size: 11, bold: true, color: [232, 201, 135], align: 'right' });
    y -= 34;
  }
  return y;
}
function bookingBlock(pdf, y, b) {
  pdf.text(40, y, 'BILLED TO', { size: 8, bold: true, color: GOLD });
  pdf.text(40, y - 14, b.customer_name, { size: 11, bold: true });
  pdf.text(40, y - 28, b.email, { size: 9, color: GREY });
  pdf.text(40, y - 41, b.phone, { size: 9, color: GREY });
  pdf.text(330, y, 'EVENT', { size: 8, bold: true, color: GOLD });
  pdf.text(330, y - 14, `${b.hall_name}`, { size: 10, bold: true });
  pdf.text(330, y - 28, `${b.event_date}  ${b.start_time} - ${b.end_time}`, { size: 9, color: GREY });
  pdf.text(330, y - 41, `${b.event_name || b.custom_event || 'Event'} · ${b.guests} guests`, { size: 9, color: GREY });
  return y - 80;
}
const stamp = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const lineRows = (b) => (b.breakdown?.lines || []).map((l) => ({ label: l.label, amount: l.amount }));

export function invoicePdf(b) {
  let inv = get('SELECT * FROM invoices WHERE booking_id=?', b.id);
  if (!inv) { run('INSERT INTO invoices(number,booking_id) VALUES (?,?)', `INV-${new Date().getFullYear()}-${String(b.id).padStart(5, '0')}`, b.id); inv = get('SELECT * FROM invoices WHERE booking_id=?', b.id); }
  const pdf = new Pdf(); let y = header(pdf, 'TAX INVOICE', inv.number, stamp());
  y = bookingBlock(pdf, y, b);
  const rows = lineRows(b);
  if (b.breakdown) rows.push({ label: `${b.breakdown.tax_label} @ ${b.breakdown.tax_percent}%`, amount: b.tax, bold: false });
  y = table(pdf, y, rows, { total: { label: 'TOTAL', amount: b.total } });
  pdf.text(40, y, `Paid: ${inr(b.paid_amount)}    Refunded: ${inr(b.refunded_amount)}    Balance due: ${inr(Math.max(0, b.total - b.paid_amount + b.refunded_amount))}`, { size: 10, bold: true, color: NAVY });
  pdf.text(40, y - 18, `Booking reference: ${b.ref}`, { size: 9, color: GREY });
  footer(pdf); return pdf.build();
}
export function receiptPdf(p, b) {
  const pdf = new Pdf(); let y = header(pdf, 'PAYMENT RECEIPT', p.receipt_no || `PAY-${p.id}`, (p.paid_at || '').slice(0, 10) || stamp());
  y = bookingBlock(pdf, y, b);
  y = table(pdf, y, [
    { label: `${p.kind === 'refund' ? 'Refund' : p.kind === 'advance' ? 'Advance payment' : 'Balance payment'} — ${b.ref}`, amount: p.amount },
    { label: `Method: ${p.provider}${p.provider_payment_id ? ' · ref ' + p.provider_payment_id : ''}`, amount: 0 },
  ], { total: { label: p.kind === 'refund' ? 'REFUNDED' : 'AMOUNT PAID', amount: p.amount } });
  pdf.text(40, y, `Booking total ${inr(b.total)} · Paid to date ${inr(b.paid_amount)} · Balance ${inr(Math.max(0, b.total - b.paid_amount + b.refunded_amount))}`, { size: 9, color: GREY });
  footer(pdf, 'Thank you for choosing us.'); return pdf.build();
}
export function confirmationPdf(b) {
  const pdf = new Pdf(); let y = header(pdf, 'BOOKING CONFIRMATION', b.ref, stamp());
  pdf.text(40, y, `Status: ${b.status.toUpperCase()}`, { size: 14, bold: true, color: b.status === 'confirmed' ? [31, 138, 91] : GOLD });
  y = bookingBlock(pdf, y - 30, b);
  const rows = lineRows(b); y = table(pdf, y, rows, { total: { label: 'TOTAL', amount: b.total } });
  pdf.text(40, y, `Advance due: ${inr(b.advance_due)}   Paid: ${inr(b.paid_amount)}   Balance: ${inr(Math.max(0, b.total - b.paid_amount + b.refunded_amount))}`, { size: 10, bold: true, color: NAVY });
  y -= 28;
  if (b.requirements) y = pdf.wrap(40, y, `Requirements: ${b.requirements}`, { size: 9, width: 500, color: GREY });
  pdf.wrap(40, y - 10, 'Please carry this confirmation and a photo ID on the event day. Cancellation and rescheduling are subject to our cancellation policy.', { size: 8.5, width: 500, color: GREY });
  footer(pdf); return pdf.build();
}
export function quotationPdf(q) {
  const pdf = new Pdf(); let y = header(pdf, 'QUOTATION', q.number, (q.created_at || '').slice(0, 10) || stamp());
  const hall = q.hall_id ? get('SELECT name FROM halls WHERE id=?', q.hall_id) : null;
  pdf.text(40, y, 'PREPARED FOR', { size: 8, bold: true, color: GOLD });
  pdf.text(40, y - 14, q.customer_name, { size: 11, bold: true });
  pdf.text(40, y - 28, [q.email, q.phone].filter(Boolean).join('  ·  '), { size: 9, color: GREY });
  pdf.text(330, y, 'EVENT', { size: 8, bold: true, color: GOLD });
  pdf.text(330, y - 14, hall?.name || 'To be confirmed', { size: 10, bold: true });
  pdf.text(330, y - 28, q.event_date || 'Date to be confirmed', { size: 9, color: GREY });
  y -= 70;
  const items = JSON.parse(q.items || '[]').map((i) => ({ label: i.label, amount: Number(i.amount) }));
  items.push({ label: `${setting('tax').label} @ ${setting('tax').percent}%`, amount: q.tax });
  y = table(pdf, y, items, { total: { label: 'TOTAL', amount: q.total } });
  if (q.valid_until) pdf.text(40, y, `Valid until ${q.valid_until}`, { size: 9, bold: true, color: NAVY });
  if (q.notes) pdf.wrap(40, y - 18, q.notes, { size: 9, width: 500, color: GREY });
  footer(pdf, 'This quotation is not a confirmed booking.'); return pdf.build();
}
