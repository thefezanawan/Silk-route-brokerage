'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateQuote } = require('../services/validate');

/**
 * POST /api/quote  (JSON body keyed by the form labels)
 *  200 {ok:true,id}            saved and team notified
 *  422 {ok:false,errors}       validation failed
 *  429                         too many requests
 *  502/503 {ok:false}          could not notify the team -> the website falls back to the visitor's email app
 */
function quoteRouter({ cfg, mailer, storage, now = () => new Date() }) {
  const router = express.Router();

  const limiter = rateLimit({
    windowMs: cfg.quoteRateWindowMin * 60 * 1000,
    limit: cfg.quoteRateMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests. Please try again later or call us directly.' },
  });

  router.post('/', limiter, async (req, res) => {
    const { ok, errors, data } = validateQuote(req.body, now());
    if (!ok) return res.status(422).json({ ok: false, errors });

    const meta = { id: 'SR-' + crypto.randomBytes(4).toString('hex').toUpperCase(), receivedAt: now().toISOString() };

    try {
      await storage.save({ ...meta, ...data });
    } catch (err) {
      console.error(`[quote] failed to store ${meta.id}: ${err.message}`);
      if (!mailer) return res.status(503).json({ ok: false, error: 'Service temporarily unavailable' });
    }

    if (!mailer) {
      // STORE_ONLY mode (no SMTP) - request is saved on the server
      console.warn(`[quote] ${meta.id} stored (no SMTP configured)`);
      return res.status(200).json({ ok: true, id: meta.id });
    }

    try {
      await mailer.sendQuote(data, meta);
      console.log(`[quote] ${meta.id} emailed to team`);
      return res.status(200).json({ ok: true, id: meta.id });
    } catch (err) {
      console.error(`[quote] ${meta.id} email failed: ${err.message}`);
      return res.status(502).json({ ok: false, error: 'Could not deliver your request right now.' });
    }
  });

  return router;
}

module.exports = { quoteRouter };
