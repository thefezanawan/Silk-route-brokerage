'use strict';
const nodemailer = require('nodemailer');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rows(q) {
  return [
    ['Full Name', q.name], ['Company', q.company], ['Email', q.email], ['Phone', q.phone],
    ['Origin', q.origin], ['Destination', q.destination], ['Freight Type', q.freightType],
    ['Weight (lbs)', q.weight], ['Dimensions (L x W x H)', q.dimensions || '—'],
    ['Pickup Date', q.pickupDate], ['Delivery Date', q.deliveryDate || '—'],
  ];
}

function buildTeamEmail(q, meta, cfg) {
  const subject = `Freight Quote Request: ${q.origin} to ${q.destination} (${q.freightType})`;
  const text = [
    'New freight quote request from the website', '',
    ...rows(q).map(([k, v]) => `${k}: ${v}`), '',
    `Reference: ${meta.id}`, `Received: ${meta.receivedAt}`,
    'Reply to this email to respond to the customer directly.',
  ].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0B2545;max-width:620px">
<h2 style="margin:0 0 4px">New freight quote request</h2>
<p style="margin:0 0 16px;color:#555">Reply to this email to respond to ${esc(q.name)} directly.</p>
<table style="border-collapse:collapse;width:100%">${rows(q).map(([k, v]) =>
    `<tr><td style="padding:8px 10px;border:1px solid #dde3ee;background:#F3F6FA;font-weight:700;width:38%">${esc(k)}</td><td style="padding:8px 10px;border:1px solid #dde3ee">${esc(v)}</td></tr>`).join('')}</table>
<p style="color:#777;font-size:12px;margin-top:16px">Reference ${esc(meta.id)} &middot; ${esc(meta.receivedAt)} &middot; ${esc(cfg.siteUrl)}</p></div>`;
  return { subject, text, html };
}

function buildConfirmationEmail(q, meta) {
  const subject = 'We received your freight quote request - Silk Route Brokerage';
  const text = [`Hi ${q.name},`, '',
    `Thank you for contacting Silk Route Brokerage. We received your request for ${q.origin} to ${q.destination} and one of our brokers will follow up shortly.`,
    '', `Reference: ${meta.id}`, '', 'Silk Route Brokerage LLC', 'Terrance Dendy: +1 864-623-8214', 'Kelea Williams: +1 864-539-6695', 'kwilliams@silkroutebrokerage.com'].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0B2545;max-width:560px"><p>Hi ${esc(q.name)},</p>
<p>Thank you for contacting Silk Route Brokerage. We received your request for <b>${esc(q.origin)}</b> to <b>${esc(q.destination)}</b> and one of our brokers will follow up shortly.</p>
<p style="color:#555">Reference: ${esc(meta.id)}</p><p>Silk Route Brokerage LLC<br>Terrance Dendy: +1 864-623-8214<br>Kelea Williams: +1 864-539-6695<br>kwilliams@silkroutebrokerage.com</p></div>`;
  return { subject, text, html };
}

function createMailer(cfg) {
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.secure,
    auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  return {
    verify: () => transport.verify(),
    async sendQuote(q, meta) {
      const team = buildTeamEmail(q, meta, cfg);
      await transport.sendMail({ from: cfg.mailFrom, to: cfg.mailTo, replyTo: { name: q.name, address: q.email }, ...team });
      if (cfg.sendConfirmation) {
        try {
          await transport.sendMail({ from: cfg.mailFrom, to: { name: q.name, address: q.email }, ...buildConfirmationEmail(q, meta) });
        } catch (err) {
          // Never fail the request because the courtesy copy bounced
          console.warn(`[mail] confirmation to customer failed (${meta.id}): ${err.message}`);
        }
      }
    },
  };
}

module.exports = { createMailer, buildTeamEmail, buildConfirmationEmail };
