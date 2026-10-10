'use strict';
const { loadConfig, assertProductionReady } = require('./src/config');
const { createApp } = require('./src/app');
const { createMailer } = require('./src/services/mailer');
const { createStorage } = require('./src/services/storage');

const cfg = loadConfig();
try { assertProductionReady(cfg); } catch (err) { console.error(err.message); process.exit(1); }

const mailer = cfg.smtpConfigured ? createMailer(cfg) : null;
if (!mailer) console.warn('[startup] SMTP not configured - quote requests will only be stored on disk.');
const storage = createStorage({ dataDir: cfg.dataDir, enabled: cfg.storeQuotes || !mailer });

const app = createApp({ cfg, mailer, storage });
const server = app.listen(cfg.port, () => {
  console.log(`[startup] Silk Route Brokerage on :${cfg.port} (${cfg.env})`);
  if (mailer) mailer.verify().then(() => console.log('[startup] SMTP connection verified'), (e) => console.warn('[startup] SMTP verify failed:', e.message));
});

function shutdown(sig) {
  console.log(`[shutdown] ${sig}`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => { console.error('[uncaughtException]', err); shutdown('uncaughtException'); });
