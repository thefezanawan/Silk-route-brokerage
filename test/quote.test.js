'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');
const { createStorage } = require('../src/services/storage');
const { validateQuote } = require('../src/services/validate');

const NOW = new Date('2026-10-10T12:00:00Z');
const good = () => ({
  'Full Name': 'Jane Shipper', 'Company Name': 'Acme Foods', 'Email Address': 'jane@acme.com', 'Phone Number': '+1 864-555-0100',
  'Origin (City, State)': 'Seneca, SC', 'Destination (City, State)': 'Atlanta, GA', 'Freight Type': 'Dry Van',
  'Weight (lbs)': '12000', 'Dimensions (L x W x H)': '48 x 40 x 60', 'Pickup Date': '2026-10-15', 'Delivery Date (if known)': '2026-10-17',
});

async function boot({ mailer, rateMax = 50, storeOnly = false } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-'));
  const cfg = loadConfig({ NODE_ENV: 'test', DATA_DIR: dataDir, QUOTE_RATE_MAX: String(rateMax), STORE_ONLY: String(storeOnly) });
  const storage = createStorage({ dataDir, enabled: true });
  const app = createApp({ cfg, mailer, storage, now: () => NOW });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, server, storage, dataDir };
}
const post = (base, body, raw) => fetch(base + '/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body) });

test('valid quote is stored and emailed', async () => {
  const sent = [];
  const t = await boot({ mailer: { sendQuote: async (q, m) => sent.push({ q, m }) } });
  const res = await post(t.base, good());
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.ok, true);
  assert.match(json.id, /^SR-[0-9A-F]{8}$/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].q.email, 'jane@acme.com');
  const line = JSON.parse(fs.readFileSync(t.storage.file, 'utf8').trim());
  assert.equal(line.id, json.id);
  t.server.close();
});

test('invalid quote returns 422 with field errors', async () => {
  const t = await boot({ mailer: { sendQuote: async () => { throw new Error('should not send'); } } });
  const bad = { ...good(), 'Full Name': '', 'Email Address': 'nope', 'Freight Type': 'Rocket', 'Pickup Date': '2020-01-01' };
  const res = await post(t.base, bad);
  const json = await res.json();
  assert.equal(res.status, 422);
  assert.equal(json.errors['Full Name'], 'Required');
  assert.ok(json.errors['Email Address']);
  assert.ok(json.errors['Freight Type']);
  assert.ok(json.errors['Pickup Date']);
  t.server.close();
});

test('phone numbers: real formats pass, junk fails', () => {
  const ok = ['864-623-8214', '+1 (864) 623-8214', '8646238214', '864.623.8214 x12', '864-623-8214 ext. 5', '+44 20 7946 0958'];
  const bad = ['12345', 'call me maybe', '<script>alert(1)</script>', '1'.repeat(20)];
  for (const v of ok) assert.equal(validateQuote({ ...good(), 'Phone Number': v }, NOW).errors['Phone Number'], undefined, v);
  for (const v of bad) assert.ok(validateQuote({ ...good(), 'Phone Number': v }, NOW).errors['Phone Number'], v);
});

test('delivery before pickup is rejected', () => {
  const r = validateQuote({ ...good(), 'Delivery Date (if known)': '2026-10-01' }, NOW);
  assert.equal(r.ok, false);
  assert.ok(r.errors['Delivery Date (if known)']);
});

test('newlines / header injection attempts are flattened', () => {
  const r = validateQuote({ ...good(), 'Origin (City, State)': 'Seneca\r\nBcc: evil@x.com' }, NOW);
  assert.equal(r.data.origin.includes('\n'), false);
});

test('email failure returns 502 so the site falls back to mailto', async () => {
  const t = await boot({ mailer: { sendQuote: async () => { throw new Error('smtp down'); } } });
  const res = await post(t.base, good());
  assert.equal(res.status, 502);
  assert.equal(fs.readFileSync(t.storage.file, 'utf8').trim().split('\n').length, 1); // still saved
  t.server.close();
});

test('store-only mode (no mailer) accepts and saves', async () => {
  const t = await boot({ mailer: null, storeOnly: true });
  const res = await post(t.base, good());
  assert.equal(res.status, 200);
  t.server.close();
});

test('rate limit kicks in', async () => {
  const t = await boot({ mailer: { sendQuote: async () => {} }, rateMax: 2 });
  assert.equal((await post(t.base, good())).status, 200);
  assert.equal((await post(t.base, good())).status, 200);
  assert.equal((await post(t.base, good())).status, 429);
  t.server.close();
});

test('malformed and oversized JSON are rejected cleanly', async () => {
  const t = await boot({ mailer: { sendQuote: async () => {} } });
  assert.equal((await post(t.base, null, '{bad json')).status, 400);
  assert.equal((await post(t.base, null, JSON.stringify({ x: 'a'.repeat(30000) }))).status, 413);
  t.server.close();
});

test('site, health check, 404 and security headers', async () => {
  const t = await boot({ mailer: null, storeOnly: true });
  const home = await fetch(t.base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Silk Route Brokerage/);
  assert.ok(home.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal(home.headers.get('x-powered-by'), null);
  assert.equal((await fetch(t.base + '/healthz')).status, 200);
  const nf = await fetch(t.base + '/nope', { headers: { Accept: 'text/html' } });
  assert.equal(nf.status, 404);
  assert.equal((await fetch(t.base + '/api/unknown')).status, 404);
  t.server.close();
});

test('reviews and notifications are removed; email links open Gmail', async () => {
  const t = await boot({ mailer: null, storeOnly: true });
  const html = await (await fetch(t.base + '/')).text();
  assert.equal(/id="reviews"|data-p="notifications"|#\/notifications|<dialog/.test(html), false);
  assert.ok(html.includes('https://mail.google.com/mail/?view=cm'));
  assert.equal(html.includes('outlook.live.com'), false);
  t.server.close();
});
