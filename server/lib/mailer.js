// Minimal SMTP client (AUTH LOGIN, implicit TLS or STARTTLS). Used only when SMTP_HOST is configured.
// NOTE: written for portability; verify against your real SMTP provider before relying on it.
import net from 'node:net';
import tls from 'node:tls';
import { config } from '../config.js';

export function sendMail({ to, subject, text }) {
  const c = config.smtp;
  return new Promise((resolve, reject) => {
    let sock = c.secure ? tls.connect(c.port, c.host, { servername: c.host }) : net.connect(c.port, c.host);
    let buf = '', waiter = null, done = false;
    const fail = (e) => { if (!done) { done = true; sock.destroy(); reject(e); } };
    const attach = (s) => { s.setEncoding('utf8'); s.on('data', (d) => { buf += d; check(); }); s.on('error', fail); };
    const check = () => {
      const lines = buf.split('\r\n');
      if (lines.length < 2) return;
      const last = lines[lines.length - 2];
      if (/^\d{3} /.test(last) && waiter) { const w = waiter; waiter = null; const r = buf; buf = ''; w(r); }
    };
    const read = () => new Promise((res) => { waiter = res; check(); });
    const cmd = async (line, ok) => {
      if (line) sock.write(line + '\r\n');
      const r = await read();
      if (!r.startsWith(String(ok))) throw new Error(`SMTP ${line?.split(' ')[0] || 'greeting'}: ${r.trim()}`);
      return r;
    };
    sock.setTimeout(15000, () => fail(new Error('SMTP timeout')));
    attach(sock);
    (async () => {
      await cmd(null, 220);
      let caps = await cmd(`EHLO ${new URL(config.siteUrl).hostname}`, 250);
      if (!c.secure && /STARTTLS/i.test(caps)) {
        await cmd('STARTTLS', 220);
        sock.removeAllListeners('data');
        sock = tls.connect({ socket: sock, servername: c.host }); attach(sock);
        caps = await cmd(`EHLO ${new URL(config.siteUrl).hostname}`, 250);
      }
      if (c.user) {
        await cmd('AUTH LOGIN', 334);
        await cmd(Buffer.from(c.user).toString('base64'), 334);
        await cmd(Buffer.from(c.pass).toString('base64'), 235);
      }
      await cmd(`MAIL FROM:<${c.from.replace(/.*<|>.*/g, '')}>`, 250);
      await cmd(`RCPT TO:<${to}>`, 250);
      await cmd('DATA', 354);
      const safeSubject = String(subject).replace(/[\r\n]/g, ' ');
      const body = `From: ${c.from}\r\nTo: ${to}\r\nSubject: ${safeSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${String(text).replace(/^\./gm, '..').replace(/\r?\n/g, '\r\n')}\r\n.`;
      await cmd(body, 250);
      await cmd('QUIT', 221).catch(() => {});
      done = true; sock.end(); resolve();
    })().catch(fail);
  });
}
