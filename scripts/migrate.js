import { migrate } from '../server/db.js';
console.log('Applied migrations:', migrate().join(', ') || '(none — already up to date)');
