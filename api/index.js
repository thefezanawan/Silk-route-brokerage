```js
'use strict';

const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');
const { createMailer } = require('../src/services/mailer');
const { createStorage } = require('../src/services/storage');

const cfg = loadConfig();

const mailer = cfg.smtpConfigured ? createMailer(cfg) : null;

const storage = createStorage({
  dataDir: cfg.dataDir,
  enabled: cfg.storeQuotes || !mailer,
});

const app = createApp({
  cfg,
  mailer,
  storage,
});

module.exports = app;
```
