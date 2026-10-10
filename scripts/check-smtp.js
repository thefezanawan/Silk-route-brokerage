'use strict';
// Usage: npm run check:smtp   (add --send to deliver a test email to MAIL_TO)
const { loadConfig } = require('../src/config');
const { createMailer } = require('../src/services/mailer');

(async () => {
  const cfg = loadConfig();
  if (!cfg.smtpConfigured) { console.error('SMTP is not configured. Fill in SMTP_* and MAIL_FROM in .env'); process.exit(1); }
  const mailer = createMailer(cfg);
  await mailer.verify();
  console.log('SMTP connection OK');
  if (process.argv.includes('--send')) {
    await mailer.sendQuote({
      name: 'Test Sender', company: 'Test Co', email: cfg.smtp.user, phone: '+1 864-000-0000', origin: 'Seneca, SC', destination: 'Atlanta, GA',
      freightType: 'Dry Van', weight: '10000', dimensions: '', pickupDate: new Date().toISOString().slice(0, 10), deliveryDate: '',
    }, { id: 'SR-TEST', receivedAt: new Date().toISOString() });
    console.log('Test quote email sent to', cfg.mailTo.join(', '));
  }
})().catch((e) => { console.error('SMTP check failed:', e.message); process.exit(1); });
