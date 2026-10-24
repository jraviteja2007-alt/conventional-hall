import { migrate } from '../server/db.js';
import { seed } from '../server/seed.js';
import { config } from '../server/config.js';
migrate();
if (config.prod && !config.seedAdminPassword) { console.error('Set SEED_ADMIN_PASSWORD before seeding in production.'); process.exit(1); }
seed({ demo: process.env.SEED_DEMO === 'true' || !config.prod });
console.log('Seed complete.');
