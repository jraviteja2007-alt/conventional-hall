import { all, get, run } from '../db.js';
import { config } from '../config.js';
import { setting } from './settings.js';
import { sendMail } from '../lib/mailer.js';

async function deliver(id, channel, recipient, subject, body) {
  let status = 'logged', error = null;
  try {
    if (channel === 'email' && config.smtp.host) { await sendMail({ to: recipient, subject, text: body }); status = 'sent'; }
    else if (channel === 'sms' && config.smsWebhookUrl) { await postJson(config.smsWebhookUrl, { to: recipient, message: body }); status = 'sent'; }
    else if (channel === 'whatsapp' && config.whatsappWebhookUrl) { await postJson(config.whatsappWebhookUrl, { to: recipient, message: body }); status = 'sent'; }
  } catch (e) { status = 'failed'; error = String(e.message || e).slice(0, 300); }
  run('UPDATE outbox SET status=?, error=? WHERE id=?', status, error, id);
}
async function postJson(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Webhook responded ${r.status}`);
}

/** In-app notification + email / SMS / WhatsApp (per admin notification settings). Never throws. */
export function notify({ userId = null, audience = 'user', type, title, body = '', link = null, email, phone }) {
  try {
    run('INSERT INTO notifications(user_id,audience,type,title,body,link) VALUES (?,?,?,?,?,?)', userId, audience, type, title, body, link);
    const prefs = setting('notifications'), biz = setting('business');
    const msg = `${body}\n\n— ${biz.name}\n${biz.phone}`;
    const targets = [];
    if (audience === 'admin') { if (prefs.email) targets.push(['email', biz.email]); }
    else {
      if (prefs.email && email) targets.push(['email', email]);
      if (prefs.sms && phone) targets.push(['sms', phone]);
      if (prefs.whatsapp && phone) targets.push(['whatsapp', phone]);
    }
    for (const [channel, to] of targets) {
      const r = run('INSERT INTO outbox(channel,recipient,subject,body) VALUES (?,?,?,?)', channel, to, title, msg);
      deliver(Number(r.lastInsertRowid), channel, to, title, msg);
    }
  } catch (e) { console.error('notify failed:', e.message); }
}
export const notifyAdmin = (type, title, body, link) => notify({ audience: 'admin', type, title, body, link });
