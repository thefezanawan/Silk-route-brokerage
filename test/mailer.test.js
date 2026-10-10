'use strict';
// Integration test: sends through the real mailer to a local fake SMTP server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SMTPServer } = require('smtp-server');
const { loadConfig } = require('../src/config');
const { createMailer } = require('../src/services/mailer');

function startSmtp() {
  const messages = [];
  const server = new SMTPServer({
    authOptional: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'],
    onAuth(auth, _s, cb) { return auth.username === 'u' && auth.password === 'p' ? cb(null, { user: 1 }) : cb(new Error('bad login')); },
    onData(stream, _s, cb) { let raw = ''; stream.on('data', (c) => (raw += c)); stream.on('end', () => { messages.push(raw); cb(); }); },
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, messages, port: server.server.address().port })));
}

const quote = {
  name: 'Jane "JJ" Shipper', company: 'Acme <Foods>', email: 'jane@acme.com', phone: '+1 864-555-0100 x12',
  origin: 'Seneca, SC', destination: 'Atlanta, GA', freightType: 'Reefer', weight: '9000', dimensions: '', pickupDate: '2026-10-15', deliveryDate: '',
};
const meta = { id: 'SR-TEST0001', receivedAt: '2026-10-10T12:00:00.000Z' };

test('quote email is delivered over SMTP with Reply-To and escaped HTML', async () => {
  const { server, messages, port } = await startSmtp();
  const cfg = loadConfig({ NODE_ENV: 'test', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: 'false', SMTP_USER: 'u', SMTP_PASS: 'p',
    MAIL_FROM: 'Site <u@example.com>', MAIL_TO: 'team@example.com, boss@example.com', SEND_CONFIRMATION: 'true' });
  const mailer = createMailer(cfg);
  await mailer.verify();
  await mailer.sendQuote(quote, meta);
  server.close();

  assert.equal(messages.length, 2); // team email + customer confirmation
  const team = messages[0].replace(/=\r?\n/g, ''); // undo quoted-printable line wrapping
  assert.match(team, /Subject: Freight Quote Request: Seneca, SC to Atlanta, GA \(Reefer\)/);
  assert.match(team, /Reply-To: .*jane@acme\.com/);
  assert.match(team, /To: team@example\.com, boss@example\.com/);
  assert.ok(team.includes('Acme &lt;Foods&gt;'), 'HTML part must escape < > in user input');
  assert.match(messages[1], /To: .*jane@acme\.com/);
  assert.match(messages[1], /SR-TEST0001/);
});

test('wrong SMTP credentials reject (route would answer 502)', async () => {
  const { server, port } = await startSmtp();
  const cfg = loadConfig({ NODE_ENV: 'test', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: 'false', SMTP_USER: 'u', SMTP_PASS: 'WRONG', MAIL_FROM: 'u@example.com' });
  await assert.rejects(createMailer(cfg).sendQuote(quote, meta));
  server.close();
});
