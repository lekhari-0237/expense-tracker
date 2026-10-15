// Launches the real Express app on a dedicated browser-E2E database so the
// automated suite (which wipes expense_tracker_test) cannot delete live UI data.
require('dotenv').config({ path: '.env' });
const db = process.env.E2E_DB || 'expense_tracker_e2e';
const uri = process.env.MONGO_URI.replace(/\/([^/?]*)(\?.*)?$/, `/${db}$2`);
process.env.MONGO_URI = uri;
process.env.PORT = process.env.E2E_PORT || '5099';
process.env.NODE_ENV = 'development';
console.log('[e2e] target database =', db, '| port =', process.env.PORT);
require('./server.js');
