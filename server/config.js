import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* .env is optional */ }

const env = process.env;
const prod = env.NODE_ENV === 'production';
if (prod && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET (>= 32 chars) is required in production. See .env.example');
}

export const config = {
  prod,
  port: Number(env.PORT || 3000),
  siteUrl: (env.SITE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dbPath: env.DB_PATH || path.join(ROOT, 'data', 'hall.db'),
  uploadDir: env.UPLOAD_DIR || path.join(ROOT, 'data', 'uploads'),
  publicDir: path.join(ROOT, 'public'),
  // Secrets only ever come from the environment, never from the frontend or the repo.
  jwtSecret: env.JWT_SECRET || crypto.createHash('sha256').update('dev-only-' + ROOT).digest('hex'),
  jwtTtlSeconds: Number(env.JWT_TTL_SECONDS || 60 * 60 * 24 * 7),
  payment: {
    provider: env.PAYMENT_PROVIDER || (prod ? 'razorpay' : 'mock'),
    razorpayKeyId: env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: env.RAZORPAY_KEY_SECRET || '',
    razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
    allowMock: !prod || env.ALLOW_MOCK_PAYMENTS === 'true',
  },
  smtp: {
    host: env.SMTP_HOST || '', port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true', user: env.SMTP_USER || '', pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || 'no-reply@example.com',
  },
  smsWebhookUrl: env.SMS_WEBHOOK_URL || '',
  whatsappWebhookUrl: env.WHATSAPP_WEBHOOK_URL || '',
  seedAdminEmail: env.SEED_ADMIN_EMAIL || 'admin@cvrconvention.com',
  seedAdminPassword: env.SEED_ADMIN_PASSWORD || 'Admin@12345',
  trustProxy: env.TRUST_PROXY === 'true',
  forceHttps: prod && env.FORCE_HTTPS !== 'false',
};
