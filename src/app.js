'use strict';
const { loadConfig } = require('./config');
const { createMailer } = require('./services/mailer');
const { createStorage } = require('./services/storage');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const { quoteRouter } = require('./routes/quote');

/**
 * App factory (dependencies injectable so tests can run without SMTP/disk).
 */
function createApp({ cfg, mailer = null, storage, now }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);

  // Security headers. The single-file frontend uses inline <script>/<style> and
  // inline image fallbacks, so 'unsafe-inline' is required for script/style.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'script-src-attr': ["'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https://static.wixstatic.com'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        ...(cfg.isProd ? { 'upgrade-insecure-requests': [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use(compression());

  // API (same-origin by default; ALLOWED_ORIGINS opens specific origins)
  if (cfg.allowedOrigins.length) {
    app.use('/api', cors({ origin: cfg.allowedOrigins, methods: ['POST', 'GET'], maxAge: 600 }));
  }
  app.use('/api', express.json({ limit: '20kb' }));
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()) }));
  app.use('/api/quote', quoteRouter({ cfg, mailer, storage, now }));
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

  // Static site
  app.use(express.static(cfg.publicDir, {
    index: 'index.html',
    extensions: ['html'],
    setHeaders(res, file) {
      if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      else res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  }));
  app.use((req, res) => {
    if (req.method === 'GET' && (req.accepts(['html', 'json']) === 'html')) {
      return res.status(404).sendFile(path.join(cfg.publicDir, '404.html'));
    }
    return res.status(404).json({ ok: false, error: 'Not found' });
  });

  // Error handler (bad JSON, payload too large, etc.)
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[error]', err);
    res.status(status).json({ ok: false, error: status === 413 ? 'Request too large' : status < 500 ? 'Bad request' : 'Server error' });
  });

  return app;
}

const vercelCfg = loadConfig();

const vercelMailer = vercelCfg.smtpConfigured
  ? createMailer(vercelCfg)
  : null;

const vercelStorage = createStorage({
  dataDir: vercelCfg.dataDir,
  enabled: vercelCfg.storeQuotes || !vercelMailer,
});

const vercelApp = createApp({
  cfg: vercelCfg,
  mailer: vercelMailer,
  storage: vercelStorage,
});

module.exports = vercelApp;
module.exports.createApp = createApp;
