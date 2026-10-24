import { all, get } from '../db/index.js';
import { quote } from './pricing.js';
import { checkAvailability, daySlots } from './availability.js';
import { getSetting } from './settings.js';
import { fmtDate, fmtINR, todayLocal, addDays, isDate } from '../lib/time.js';

/**
 * Booking assistant. DESIGN RULE: it never invents availability or prices - every figure in a reply is
 * computed by the same backend services the booking flow uses. It is rule-based, so it works with no API key;
 * an LLM can be layered on top by passing it ONLY the `facts` returned here.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function extractDate(text) {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m && isDate(m[0])) return m[0];
  m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
  if (m) { const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (isDate(d)) return d; }
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(\d{4}))?/);
  if (!m) { const m2 = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/); if (m2) m = [m2[0], m2[2], m2[1], m2[3]]; }
  if (m) {
    const today = todayLocal();
    let y = Number(m[3] || today.slice(0, 4));
    const mm = String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0');
    let d = `${y}-${mm}-${m[1].padStart(2, '0')}`;
    if (isDate(d) && d < today && !m[3]) { y += 1; d = `${y}-${mm}-${m[1].padStart(2, '0')}`; }
    if (isDate(d)) return d;
  }
  if (/\btomorrow\b/.test(t)) return addDays(todayLocal(), 1);
  return null;
}
const extractGuests = (t) => { const m = t.match(/(\d{2,5})\s*(?:guests?|people|persons?|pax|members)/i) || t.match(/(?:for|around|about)\s+(\d{2,5})\b/i); return m ? Number(m[1]) : null; };
const EVENT_WORDS = [['wedding', 'wedding'], ['marriage', 'wedding'], ['reception', 'reception'], ['engagement', 'engagement'], ['birthday', 'birthday'], ['corporate', 'corporate'], ['conference', 'conference'], ['seminar', 'seminar'], ['cultural', 'cultural']];
const extractEvent = (t) => EVENT_WORDS.find(([w]) => t.includes(w))?.[1] || null;

export function recommendPackages({ eventSlug, guests, budget, hallId }) {
  const pkgs = all(`SELECT * FROM packages WHERE is_active=1 AND tier<>'custom' AND (hall_id IS NULL OR hall_id=COALESCE(?, hall_id))`, hallId ?? null);
  const date = addDays(todayLocal(), 60);
  const scored = [];
  for (const p of pkgs) {
    if (guests && (guests < p.min_guests || guests > p.max_guests)) continue;
    const hall = get('SELECT * FROM halls WHERE is_active=1 AND (? IS NULL OR id=?) AND max_guests >= ? ORDER BY sort_order LIMIT 1', p.hall_id, p.hall_id, guests || 1);
    if (!hall) continue;
    let est = null;
    try { est = quote({ hallId: hall.id, date, start: '10:00', end: `${String(10 + Math.min(p.duration_hours, 12)).padStart(2, '0')}:00`, guests: guests || p.min_guests, packageId: p.id }); } catch { continue; }
    let score = 50;
    if (eventSlug === 'wedding' && p.tier === 'wedding') score += 40;
    if (eventSlug && ['corporate', 'conference', 'seminar'].includes(eventSlug) && p.tier === 'corporate') score += 40;
    if (eventSlug && ['birthday', 'engagement', 'reception'].includes(eventSlug) && ['standard', 'premium'].includes(p.tier)) score += 20;
    if (budget) score += est.total <= budget ? 25 : -Math.min(45, Math.round(((est.total - budget) / budget) * 60));
    scored.push({ package: p, hall: { id: hall.id, name: hall.name, slug: hall.slug }, estimate: { total: est.total, subtotal: est.subtotal, guests: guests || p.min_guests }, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function answer(message) {
  const text = String(message || '').slice(0, 500);
  const t = text.toLowerCase();
  const site = getSetting('site');
  const facts = {};
  const out = (reply, extra = {}) => ({ reply, facts, suggestions: ['Check availability', 'See packages', 'Facilities', 'How to book', 'Contact'], ...extra });
  const hall = get('SELECT * FROM halls WHERE is_active=1 ORDER BY sort_order LIMIT 1');
  if (!hall) return out('Our hall details are being updated. Please contact us.');

  const date = extractDate(text);
  const guests = extractGuests(text);
  const ev = extractEvent(t);

  if (/(available|availability|free|vacant|open on|book(ed)? on|slot)/.test(t) || (date && /(is|are|can)/.test(t) && !/price|cost|rate|quote/.test(t))) {
    if (!date) return out('Which date are you considering? You can type something like "12 Dec 2026" or "2026-12-12".');
    if (date < todayLocal()) return out('That date has already passed. Please pick an upcoming date.');
    const halls = all('SELECT id, name FROM halls WHERE is_active=1 ORDER BY sort_order');
    facts.availability = halls.map((h) => ({ hall: h.name, date, slots: daySlots(h.id, date).map((s) => ({ slot: s.label, available: s.available })) }));
    const lines = facts.availability.map((a) => `${a.hall}: ${a.slots.map((s) => `${s.slot} ${s.available ? 'available' : 'booked'}`).join(', ')}`);
    return out(`Here is the live availability for ${fmtDate(date)}:\n${lines.join('\n')}\n\nOpen the Availability page to pick your slot and book.`, { action: { label: 'Check availability', href: `/availability?date=${date}` } });
  }

  if (/(price|cost|rate|charge|quote|how much|budget|estimate)/.test(t) || (guests && ev)) {
    const g = guests || 300;
    const budget = (t.match(/(?:budget|under|within|upto|up to)\s*(?:of\s*)?(?:rs\.?|inr|₹)?\s*([\d,]+)\s*(lakh|lakhs|l|k)?/i) || []);
    let b = budget[1] ? Number(budget[1].replace(/,/g, '')) : null;
    if (b && /lakh|^l$/i.test(budget[2] || '')) b *= 100000; else if (b && /^k$/i.test(budget[2] || '')) b *= 1000;
    const recs = recommendPackages({ eventSlug: ev, guests: g, budget: b });
    facts.recommendations = recs.map((r) => ({ package: r.package.name, hall: r.hall.name, estimate: r.estimate.total }));
    if (!recs.length) return out(`I could not find a ready package for ${g} guests. Please share your requirements on the Contact page and we will prepare a custom quotation.`);
    const lines = recs.map((r) => `- ${r.package.name} at ${r.hall.name}: about ${fmtINR(r.estimate.total)} incl. GST for ${r.estimate.guests} guests`);
    return out(`For ${g} guests${ev ? ` (${ev})` : ''}${b ? ` within ${fmtINR(b)}` : ''}, I would suggest:\n${lines.join('\n')}\n\nThese are indicative estimates for a weekday ~60 days out. Exact pricing depends on date, season and add-ons - the booking page shows a transparent breakdown.`, { action: { label: 'View packages', href: '/packages' } });
  }

  if (/(package|packages|plan|offer)/.test(t)) {
    const pk = all(`SELECT name, tier, price, per_guest_price, duration_hours FROM packages WHERE is_active=1 ORDER BY sort_order`);
    facts.packages = pk;
    return out(`We offer ${pk.map((p) => p.name).join(', ')}. ${pk.filter((p) => p.price).slice(0, 4).map((p) => `${p.name} starts at ${fmtINR(p.price)}${p.per_guest_price ? ` + ${fmtINR(p.per_guest_price)}/guest` : ''}`).join('; ')}. Prices exclude GST.`, { action: { label: 'Compare packages', href: '/packages' } });
  }

  if (/(facilit|parking|ac\b|air.?condition|stage|room|wifi|wi-fi|generator|power|dining|kitchen|sound|light|wheelchair|access|security)/.test(t)) {
    const f = all(`SELECT f.name, hf.details FROM hall_facilities hf JOIN facilities f ON f.id=hf.facility_id WHERE hf.hall_id=? AND f.is_active=1 ORDER BY f.sort_order`, hall.id);
    facts.facilities = f;
    return out(`${hall.name} offers: ${f.map((x) => (x.details ? `${x.name} (${x.details})` : x.name)).join('; ')}.`, { action: { label: 'See facilities', href: '/facilities' } });
  }

  if (/(capacity|guests|how many people|seating|size|dimension)/.test(t)) {
    const hs = all('SELECT name, min_guests, max_guests, seating_capacity, dining_capacity, area_sqm FROM halls WHERE is_active=1 ORDER BY sort_order');
    facts.halls = hs;
    return out(hs.map((h) => `${h.name}: ${h.min_guests}-${h.max_guests} guests, seating ${h.seating_capacity}, dining ${h.dining_capacity}, ${Math.round(h.area_sqm)} sq m`).join('\n'), { action: { label: 'Explore halls', href: '/halls' } });
  }

  if (/(where|location|address|direction|map|reach|located)/.test(t)) {
    return out(`We are at ${site.address}. Open the Contact page for the map and directions.`, { action: { label: 'Get directions', href: '/contact' } });
  }

  if (/(cancel|refund|reschedul|policy)/.test(t)) {
    const tiers = getSetting('booking').cancellation_tiers;
    facts.cancellation_tiers = tiers;
    return out(`Refund of the amount paid, based on how early you cancel: ${tiers.map((x) => `${x.days_before}+ days before: ${x.refund_pct}%`).join(' | ')}. Rescheduling is allowed up to ${getSetting('booking').reschedule_cutoff_days} days before the event (${getSetting('booking').max_reschedules} time).`, { action: { label: 'Read policy', href: '/cancellation-policy' } });
  }

  if (/(how|process|steps|book|payment|advance)/.test(t)) {
    const b = getSetting('booking');
    return out(`1) Check availability for your date and slot. 2) Pick a package and add-ons. 3) Enter your details. 4) Pay the ${b.advance_pct}% advance online to hold the date instantly, or send a request for our team to approve. 5) Receive your confirmation and invoice by email/SMS/WhatsApp.`, { action: { label: 'Start booking', href: '/book' } });
  }

  if (/(contact|phone|call|whatsapp|email|number)/.test(t)) {
    return out(`You can call ${site.phone}, email ${site.email}, or WhatsApp us. ${site.opening_hours}`, { action: { label: 'Contact us', href: '/contact' } });
  }

  return out(`I can help with availability, pricing estimates, packages, facilities, location and the booking process for ${site.name}. What would you like to know?`);
}
