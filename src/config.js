'use strict';
const path = require('path');
require('dotenv').config();

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const cfg = {
    env: env.NODE_ENV || 'development',
    isProd,
    port: int(env.PORT, 3000),
    trustProxy: env.TRUST_PROXY === undefined ? (isProd ? 1 : 0) : int(env.TRUST_PROXY, 0),
    siteUrl: env.SITE_URL || 'http://localhost:3000',
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    smtp: {
      host: env.SMTP_HOST || '',
      port: int(env.SMTP_PORT, 465),
      secure: bool(env.SMTP_SECURE, int(env.SMTP_PORT, 465) === 465),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
    },
    mailFrom: env.MAIL_FROM || env.SMTP_USER || '',
    mailTo: list(env.MAIL_TO || 'kwilliams@silkroutebrokerage.com'),
    sendConfirmation: bool(env.SEND_CONFIRMATION, false),
    storeQuotes: bool(env.STORE_QUOTES, true),
    dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data')),
    quoteRateMax: int(env.QUOTE_RATE_MAX, 5),
    quoteRateWindowMin: int(env.QUOTE_RATE_WINDOW_MIN, 15),
    storeOnly: bool(env.STORE_ONLY, false),
    publicDir: path.join(__dirname, '..', 'public'),
  };
  cfg.smtpConfigured = Boolean(cfg.smtp.host && cfg.smtp.user && cfg.smtp.pass && cfg.mailFrom);
  return cfg;
}

function assertProductionReady(cfg) {
  if (!cfg.isProd) return;
  const problems = [];
  if (!cfg.smtpConfigured && !cfg.storeOnly) {
    problems.push('SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM). Set STORE_ONLY=true to run without email.');
  }
  if (!cfg.mailTo.length) problems.push('MAIL_TO is empty.');
  if (!cfg.siteUrl.startsWith('https://')) problems.push('SITE_URL should be an https:// URL in production.');
  if (problems.length) {
    const err = new Error('Invalid production configuration:\n - ' + problems.join('\n - '));
    err.code = 'CONFIG';
    throw err;
  }
}

module.exports = { loadConfig, assertProductionReady };
