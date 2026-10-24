import { all, get } from '../db.js';
import { ApiError } from '../lib/http.js';
import { setting } from './settings.js';
import { toMin, todayISO } from '../lib/validate.js';

const money = (n) => Math.round(n);
export const dayOfWeek = (date) => new Date(date + 'T00:00:00Z').getUTCDay();

export function dayType(date) {
  if (get('SELECT 1 x FROM holidays WHERE date=?', date)) return 'holiday';
  const d = dayOfWeek(date);
  return d === 0 || d === 6 ? 'weekend' : 'weekday';
}
export function season(date) {
  const m = Number(date.slice(5, 7)); const p = setting('pricing');
  return p.peak_months.includes(m) ? 'peak' : p.off_months.includes(m) ? 'off' : 'regular';
}

/** Calculates a complete, transparent server-side price. The client never supplies prices. */
export function quote({ hall_id, date, start, end, guests, package_id, services = [], coupon, strict = true }) {
  const b = setting('booking'), pr = setting('pricing'), tax = setting('tax');
  const hall = get('SELECT * FROM halls WHERE id=? AND active=1', hall_id);
  if (!hall) throw new ApiError(404, 'HALL_NOT_FOUND', 'Hall not found');
  const sMin = toMin(start), eMin = toMin(end);
  const hours = (eMin - sMin) / 60;
  const fields = {};
  if (eMin <= sMin) fields.end_time = 'End time must be after start time';
  else if (hours < b.min_hours) fields.end_time = `Minimum booking is ${b.min_hours} hours`;
  else if (hours > b.max_hours) fields.end_time = `Maximum booking is ${b.max_hours} hours`;
  if (strict) {
    const today = todayISO();
    if (date < today) fields.event_date = 'Please choose a future date';
    else if ((Date.parse(date) - Date.parse(today)) / 864e5 > b.max_advance_days) fields.event_date = `Bookings open up to ${b.max_advance_days} days in advance`;
  }
  if (guests > hall.max_guests) fields.guests = `${hall.name} hosts up to ${hall.max_guests} guests`;
  else if (guests < 1) fields.guests = 'Enter the number of guests';
  if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields', fields);

  const pkg = package_id ? get('SELECT * FROM packages WHERE id=? AND active=1', package_id) : null;
  if (package_id && !pkg) throw new ApiError(404, 'PACKAGE_NOT_FOUND', 'Package not found');
  if (pkg?.guest_capacity && guests > pkg.guest_capacity) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields', { package_id: `${pkg.name} supports up to ${pkg.guest_capacity} guests` });
  }

  const lines = [];
  // Time-based pricing: hourly rate, capped by the half-day / full-day tariff.
  let base = hours >= 12 ? hall.base_price : Math.min(hall.hourly_price * hours, hours <= 6 ? hall.half_day_price : hall.base_price);
  base = money(base);
  const dt = dayType(date), ss = season(date);
  const dayMult = dt === 'holiday' ? pr.holiday_multiplier : dt === 'weekend' ? pr.weekend_multiplier : 1;
  const seasonMult = ss === 'peak' ? pr.peak_multiplier : ss === 'off' ? pr.offseason_multiplier : 1;
  let hallAmount = 0;
  if (pkg?.includes_hall) {
    lines.push({ type: 'hall', label: `${hall.name} · ${hours}h (included in ${pkg.name})`, amount: 0 });
  } else {
    lines.push({ type: 'hall', label: `${hall.name} · ${hours}h rental`, amount: base });
    const dayAdj = money(base * (dayMult - 1)), seasonAdj = money(base * (seasonMult - 1));
    if (dayAdj) lines.push({ type: 'adjust', label: `${dt === 'holiday' ? 'Holiday' : 'Weekend'} pricing (${dayMult > 1 ? '+' : ''}${Math.round((dayMult - 1) * 100)}%)`, amount: dayAdj });
    if (seasonAdj) lines.push({ type: 'adjust', label: `${ss === 'peak' ? 'Peak season' : 'Off-season'} pricing (${seasonMult > 1 ? '+' : ''}${Math.round((seasonMult - 1) * 100)}%)`, amount: seasonAdj });
    hallAmount = base + dayAdj + seasonAdj;
  }

  let packageAmount = 0;
  if (pkg) {
    const fixed = pkg.price, perGuest = money(pkg.per_guest_price * guests);
    packageAmount = fixed + perGuest;
    lines.push({ type: 'package', label: `${pkg.name} package${pkg.per_guest_price ? ` (${guests} guests × ₹${pkg.per_guest_price} + ₹${fixed})` : ''}`, amount: packageAmount });
  }

  const included = new Set(pkg ? all('SELECT service_id FROM package_services WHERE package_id=?', pkg.id).map((r) => r.service_id) : []);
  const picked = []; let servicesAmount = 0;
  for (const s of services) {
    const svc = get('SELECT * FROM services WHERE id=? AND active=1', Number(s.id));
    if (!svc || included.has(svc.id)) continue; // unknown or already bundled in the package
    const qty = Math.max(1, Math.min(50, Number(s.qty) || 1));
    const unit = svc.price_type === 'per_guest' ? svc.price * guests : svc.price_type === 'per_hour' ? svc.price * hours : svc.price;
    const amount = money(unit * qty);
    servicesAmount += amount;
    picked.push({ id: svc.id, name: svc.name, qty, amount });
    lines.push({ type: 'service', label: `${svc.name}${qty > 1 ? ` × ${qty}` : ''}${svc.price_type === 'per_guest' ? ` (${guests} guests)` : svc.price_type === 'per_hour' ? ` (${hours}h)` : ''}`, amount });
  }

  const subtotal = hallAmount + packageAmount + servicesAmount;
  let discount = 0, couponInfo = null;
  if (coupon) {
    const c = get('SELECT * FROM coupons WHERE code=? AND active=1', String(coupon).trim());
    const today = todayISO();
    const err = !c ? 'Invalid coupon code' : c.valid_from && today < c.valid_from ? 'This coupon is not active yet'
      : c.valid_to && today > c.valid_to ? 'This coupon has expired' : c.max_uses != null && c.used >= c.max_uses ? 'This coupon has been fully redeemed'
      : subtotal < c.min_amount ? `Minimum order ₹${c.min_amount} for this coupon` : null;
    if (err) throw new ApiError(422, 'VALIDATION_ERROR', err, { coupon: err });
    discount = Math.min(subtotal, c.type === 'percent' ? money((subtotal * c.value) / 100) : c.value);
    couponInfo = { code: c.code, description: c.description };
    lines.push({ type: 'discount', label: `Coupon ${c.code}${c.type === 'percent' ? ` (${c.value}% off)` : ''}`, amount: -discount });
  }
  const taxable = subtotal - discount;
  const taxAmount = money((taxable * tax.percent) / 100);
  const total = taxable + taxAmount;
  const advance_due = Math.min(total, money((total * b.advance_percent) / 100));
  return {
    hall: { id: hall.id, name: hall.name }, hours, day_type: dt, season: ss, lines, services: picked,
    hall_amount: hallAmount, package_amount: packageAmount, services_amount: servicesAmount,
    subtotal, discount, tax: taxAmount, tax_label: tax.label, tax_percent: tax.percent, total,
    advance_percent: b.advance_percent, advance_due, balance: total - advance_due, coupon: couponInfo,
  };
}
