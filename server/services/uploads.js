import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { E, HttpError } from '../lib/http.js';

const TYPES = {
  jpg: { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]] },
  png: { mime: 'image/png', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  webp: { mime: 'image/webp', magic: [[0x52, 0x49, 0x46, 0x46]] },
  pdf: { mime: 'application/pdf', magic: [[0x25, 0x50, 0x44, 0x46]] },
};
const IMAGE_ONLY = ['jpg', 'jpeg', 'png', 'webp'];

/**
 * Secure upload: validates extension, declared MIME, magic bytes and size. Files are stored under a random
 * server-generated name (the original name is never used on disk) in a directory that is NOT web-served.
 */
export function saveUpload({ buffer, filename, mime, imagesOnly = false, subdir = 'docs' }) {
  if (!buffer?.length) throw E.badRequest('Empty file');
  if (buffer.length > config.maxUploadBytes) throw new HttpError(413, 'FILE_TOO_LARGE', `Files must be ${config.maxUploadBytes / 1024 / 1024} MB or smaller`);
  const orig = path.basename(String(filename || 'file')).replace(/[^\w.\- ]/g, '_').slice(0, 100);
  const ext = path.extname(orig).slice(1).toLowerCase();
  const allowed = imagesOnly ? IMAGE_ONLY : Object.keys(TYPES);
  const spec = TYPES[ext];
  if (!spec || !allowed.includes(ext)) throw E.unprocessable('FILE_TYPE', `Allowed file types: ${allowed.join(', ')}`);
  if (String(mime || '').split(';')[0].trim() !== spec.mime) throw E.unprocessable('FILE_MIME', 'The file type does not match its extension');
  if (!spec.magic.some((m) => m.every((b, i) => buffer[i] === b))) throw E.unprocessable('FILE_CONTENT', 'The file content does not match its type');
  if (ext === 'webp' && buffer.slice(8, 12).toString('ascii') !== 'WEBP') throw E.unprocessable('FILE_CONTENT', 'The file content does not match its type');
  const dir = path.join(config.uploadDir, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const stored = `${crypto.randomBytes(16).toString('hex')}.${ext === 'jpeg' ? 'jpg' : ext}`;
  fs.writeFileSync(path.join(dir, stored), buffer, { mode: 0o640 });
  return { stored, original: orig, mime: spec.mime, size: buffer.length, ext };
}

export function readUpload(subdir, stored) {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/.test(stored)) return null;
  const p = path.join(config.uploadDir, subdir, stored);
  return fs.existsSync(p) ? p : null;
}
