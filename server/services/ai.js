// Booking assistant: grounded in live database data. It NEVER guesses availability or prices —
// every figure comes from the same pricing/availability services the booking flow uses.
import { all, get } from '../db.js';
import { setting } from './settings.js';
import { quote } from './pricing.js';
import { conflicts } from './availability.js';
import { toMin, todayISO } from '../lib/validate.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

export function parseDate(text) {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return m[0];
  m = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/.exec(text);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join('|')})[a-z]*\\.?(?:,?\\s+(\\d{4}))?`, 'i').exec(text)
    || null;
  let d, mon, y;
  if (m) { d = +m[1]; mon = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1; y = m[3]; }
  else {
    m = new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'i').exec(text);
    if (!m) return null;
    mon = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1; d = +m[2]; y = m[3];
  }
  const now = new Date(); let year = y ? +y : now.getUTCFullYear();
  let iso = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!y && iso < todayISO()) iso = `${year + 1}-${iso.slice(5)}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
function parseGuests(t) {
  const m = /(\d{2,5})\s*(?:guests?|people|persons?|pax|members|attendees)/i.exec(t) || /for\s+(\d{2,5})\b/i.exec(t);
  return m ? +m[1] : null;
}
function parseBudget(t) {
  let m = /(\d+(?:\.\d+)?)\s*(?:lakhs?|lacs?|l\b)/i.exec(t);
  if (m) return Math.round(+m[1] * 100000);
  m = /(?:budget|under|within|upto|up to|around)\s*(?:of\s*)?(?:₹|rs\.?|inr)?\s*(\d[\d,]{3,})/i.exec(t) || /(?:₹|rs\.?)\s*(\d[\d,]{3,})/i.exec(t);
  return m ? +m[1].replace(/,/g, '') : null;
}
function parseEvent(t) {
  const ev = all('SELECT id, slug, name FROM event_types WHERE active=1');
  const lower = t.toLowerCase();
  return ev.find((e) => lower.includes(e.name.toLowerCase().replace(/s$/, '')) || lower.includes(e.slug.replace(/s$/, ''))) || null;
}

export function recommend({ guests, budget, eventType }) {
  const pk = all('SELECT * FROM packages WHERE active=1');
  const scored = pk.filter((p) => !p.guest_capacity || !guests || p.guest_capacity >= guests).map((p) => {
    const cost = p.price + p.per_guest_price * (guests || 100);
    let score = p.popularity;
    if (budget) score += cost <= budget ? 50 - Math.abs(budget - cost) / budget * 30 : -100;
    if (eventType) { const n = (p.name + ' ' + p.tier + ' ' + (p.description || '')).toLowerCase(); if (n.includes(eventType.slug.replace(/s$/, ''))) score += 60; if (/wedding|reception|engagement/.test(eventType.slug) && p.tier === 'wedding') score += 60; if (/corporate|conference|seminar/.test(eventType.slug) && p.tier === 'corporate') score += 60; }
    return { ...p, cost, score };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

export function chat(message) {
  const t = String(message || '').slice(0, 500), l = t.toLowerCase();
  const biz = setting('business'), actions = [];
  const date = parseDate(t), guests = parseGuests(t), budget = parseBudget(t), ev = parseEvent(t);
  const hall = all('SELECT * FROM halls WHERE active=1 ORDER BY popularity DESC');

  if (/\b(available|availability|free|vacant|open on|book(ed)?)\b/.test(l) && date) {
    const slots = all('SELECT slug,name,start_time,end_time FROM time_slots WHERE active=1');
    const lines = [];
    for (const h of hall) {
      const free = slots.filter((s) => !conflicts({ hallId: h.id, date, startMin: toMin(s.start_time), endMin: toMin(s.end_time) }).length).map((s) => s.name);
      lines.push(`• ${h.name}: ${free.length ? 'available for ' + free.join(', ') : 'fully booked'}`);
    }
    actions.push({ label: 'Check calendar', href: `/availability?date=${date}` }, { label: 'Book this date', href: `/book?date=${date}` });
    return { reply: `Here is the live availability for ${date}:\n${lines.join('\n')}`, actions };
  }
  if (/\b(price|pricing|cost|rate|charges?|how much|quote|tariff)\b/.test(l)) {
    const h = hall.find((x) => l.includes(x.name.toLowerCase().split(' ')[0].toLowerCase())) || hall[0];
    if (date && h) {
      try {
        const q = quote({ hall_id: h.id, date, start: '10:00', end: '16:00', guests: Math.min(guests || 200, h.max_guests) });
        actions.push({ label: 'Get exact quote', href: `/book?date=${date}&hall=${h.id}` });
        return { reply: `For ${h.name} on ${date} (10:00–16:00, ${guests || 200} guests) the estimate is ${inr(q.total)} including ${q.tax_label}. ${q.lines.map((x) => `${x.label}: ${inr(x.amount)}`).join('; ')}. Final pricing is shown before you confirm.`, actions };
      } catch (e) { /* fall through to general pricing */ }
    }
    actions.push({ label: 'View packages', href: '/packages' });
    return { reply: hall.map((x) => `${x.name}: from ${inr(x.hourly_price)}/hour · half-day ${inr(x.half_day_price)} · full-day ${inr(x.base_price)} (weekends, holidays and peak season cost more; ${setting('tax').label} ${setting('tax').percent}% extra).`).join('\n'), actions };
  }
  if (/\b(recommend|suggest|which package|best package|suitable|plan)\b/.test(l) || (guests && (budget || ev))) {
    const picks = recommend({ guests, budget, eventType: ev });
    if (!picks.length) return { reply: 'I could not find a package matching that. Our team can build a custom quotation for you.', actions: [{ label: 'Contact us', href: '/contact' }] };
    actions.push({ label: 'Compare packages', href: '/packages' }, { label: 'Start booking', href: '/book' });
    return { reply: `Based on ${[ev && ev.name, guests && guests + ' guests', budget && 'a budget of ' + inr(budget)].filter(Boolean).join(', ') || 'popular choices'}, I'd suggest:\n` + picks.map((p, i) => `${i + 1}. ${p.name} — about ${inr(p.cost)} before tax${p.guest_capacity ? ` (up to ${p.guest_capacity} guests)` : ''}`).join('\n'), actions };
  }
  if (/\b(package|packages|bundle|plan)s?\b/.test(l)) {
    const p = all('SELECT name, price, per_guest_price, guest_capacity FROM packages WHERE active=1 ORDER BY price');
    actions.push({ label: 'Compare packages', href: '/packages' });
    return { reply: 'Our packages:\n' + p.map((x) => `• ${x.name}: ${inr(x.price)}${x.per_guest_price ? ` + ${inr(x.per_guest_price)}/guest` : ''}`).join('\n'), actions };
  }
  if (/\b(facilit|amenit|parking|ac\b|air.?condition|stage|dining|kitchen|wifi|wi-fi|power|generator|sound|light|rooms?|security|wheelchair|accessib)/.test(l)) {
    const f = all('SELECT name, spec FROM facilities WHERE active=1 ORDER BY sort');
    actions.push({ label: 'See facilities', href: '/facilities' });
    return { reply: 'Facilities:\n' + f.map((x) => `• ${x.name}${x.spec ? ' — ' + x.spec : ''}`).join('\n'), actions };
  }
  if (/\b(capacity|guests|seat|how many people)\b/.test(l)) {
    return { reply: hall.map((h) => `${h.name}: ${h.min_guests}–${h.max_guests} guests, ${h.seating_capacity} seated, ${h.dining_capacity} dining.`).join('\n'), actions: [{ label: 'Explore halls', href: '/halls' }] };
  }
  if (/\b(where|location|address|direction|map|reach|guntur)\b/.test(l)) {
    return { reply: `We're at ${biz.address}. Call ${biz.phone} for directions.`, actions: [{ label: 'Open in Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${biz.lat},${biz.lng}` }] };
  }
  if (/\b(cancel|refund|reschedul|policy)\b/.test(l)) {
    const tiers = setting('cancellation').tiers;
    return { reply: 'Refund of the amount paid, based on days before the event: ' + tiers.map((x) => `${x.min_days}+ days → ${x.refund_percent}%`).join(', ') + '. Rescheduling is free up to ' + setting('booking').customer_modify_days + ' days before the event (subject to availability).', actions: [{ label: 'Cancellation policy', href: '/policies/cancellation' }] };
  }
  if (/\b(how|process|steps|book|booking)\b/.test(l)) {
    return { reply: `Booking is simple: 1) check availability, 2) choose date, time and package, 3) enter your details, 4) submit the request. We review it, then you pay a ${setting('booking').advance_percent}% advance to confirm.`, actions: [{ label: 'Start booking', href: '/book' }] };
  }
  if (/\b(contact|call|phone|whatsapp|email|talk)\b/.test(l)) {
    return { reply: `Call ${biz.phone}, WhatsApp ${biz.phone}, or email ${biz.email}. We're open ${biz.hours}.`, actions: [{ label: 'WhatsApp us', href: `https://wa.me/${biz.whatsapp}` }, { label: 'Send enquiry', href: '/contact' }] };
  }
  return { reply: `Hi! I can check availability, estimate prices, suggest packages and explain how booking works. Try “Is 15 December free?” or “Suggest a package for 300 guests, budget 3 lakh”.`, actions: [{ label: 'Check availability', href: '/availability' }, { label: 'Talk to us', href: '/contact' }] };
}
