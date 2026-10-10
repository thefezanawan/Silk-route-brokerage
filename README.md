# Silk Route Brokerage LLC: Website + Quote Backend

Production-ready project: the finished single-page website (navy / amber palette) served by a small
Node.js + Express backend that receives the **Freight Quote** form, validates it, saves a copy, and emails it to your team.

```
silk-route-brokerage/
├── public/                 Frontend (index.html = whole site), 404 page, robots.txt, sitemap.xml
├── src/
│   ├── app.js              Express app: security headers, static site, API routing
│   ├── config.js           Environment configuration + production checks
│   ├── routes/quote.js     POST /api/quote
│   └── services/           validate.js · mailer.js (SMTP) · storage.js (quotes.jsonl)
├── server.js               Entry point (graceful shutdown)
├── test/quote.test.js      Automated tests (npm test)
├── scripts/check-smtp.js   Test your email settings
├── deploy/                 nginx.conf · silk-route.service (systemd)
├── Dockerfile · docker-compose.yml · render.yaml
├── .github/workflows/ci.yml
└── docs/                   SITE-INFO.md (business details) · FRONTEND-NOTES.txt (original frontend notes)
```

## 1. Run it locally (2 minutes)

Requires Node.js 20+ (22 recommended).

```bash
npm install
cp .env.example .env        # then edit .env (see "Email setup")
npm run check:smtp -- --send   # optional: sends a test email to MAIL_TO
npm start                   # http://localhost:3000
npm test                    # 13 automated tests (validation, API, security headers, real SMTP delivery)
npm run audit:prod          # dependency vulnerability check (should report 0)
```

No SMTP yet? Set `STORE_ONLY=true` in `.env`. Quotes are then saved to `data/quotes.jsonl` without sending email.

## 2. How the quote form works

1. The visitor submits the form. The browser sends JSON to `POST /api/quote` (`ENDPOINT` in `public/index.html`).
2. The server validates every field (required fields, email, phone, freight type, dates), flattens line breaks (blocks email-header injection), and rate-limits to 5 requests per 15 minutes per IP.
3. The request is saved to `data/quotes.jsonl` (reference ID like `SR-1A2B3C4D`).
4. An email goes to `MAIL_TO` with the customer set as **Reply-To**, so replying answers the customer directly.
5. The visitor sees "Request sent". If the server or email is unavailable (HTTP 502), the site automatically falls back to its built-in "Open in Gmail / Outlook / Copy" flow, so no lead is lost.

| Response | Meaning |
|---|---|
| `200 {ok,id}` | Saved and team emailed |
| `422 {errors}` | Validation failed |
| `429` | Rate limit hit |
| `502` | Email failed (request is still saved), and the site falls back to the visitor's email app |

## 3. Email setup (SMTP)

Fill these in `.env` (all in `.env.example`). **Gmail / Google Workspace:** turn on 2-step verification, create an *App Password*, then:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=youraccount@gmail.com
SMTP_PASS=<16-character app password>
MAIL_FROM="Silk Route Website <youraccount@gmail.com>"
MAIL_TO=kwilliams@silkroutebrokerage.com     # comma-separate to add more people
```

Other providers (Microsoft 365, SendGrid, Mailgun, Amazon SES, Zoho) work with their SMTP host, port and credentials.
Set `SEND_CONFIRMATION=true` to also send the customer an automatic "we received your request" email.
**Never commit `.env`**. It is already in `.gitignore`.

## 4. Deploy

In production the server **refuses to start** without SMTP settings (or `STORE_ONLY=true`), so a misconfiguration can't silently drop leads.

### Option A: Render (easiest)
1. Push this folder to a GitHub repo, then in Render choose **New → Blueprint** and select the repo (`render.yaml` is included).
2. Enter `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` when prompted.
3. Add your domain under **Settings → Custom Domains**. HTTPS is automatic.

Railway, Fly.io and Heroku also work: build with `npm ci --omit=dev`, start with `node server.js`, set the env vars, and set `TRUST_PROXY=1`.

### Option B: Docker
```bash
cp .env.example .env && nano .env
docker compose up -d --build
```
Quotes persist in the `quotes-data` volume. Put HTTPS in front (Caddy, Nginx, or your host's proxy).

### Option C: VPS (Ubuntu) with Nginx + systemd
```bash
sudo useradd -r -m silkroute && sudo mkdir -p /opt/silk-route-brokerage
sudo cp -r . /opt/silk-route-brokerage && cd /opt/silk-route-brokerage
sudo npm ci --omit=dev && sudo cp .env.example .env && sudo nano .env
sudo chown -R silkroute:silkroute /opt/silk-route-brokerage
sudo cp deploy/silk-route.service /etc/systemd/system/ && sudo systemctl enable --now silk-route
sudo cp deploy/nginx.conf /etc/nginx/sites-available/silkroutebrokerage.com
sudo ln -s /etc/nginx/sites-available/silkroutebrokerage.com /etc/nginx/sites-enabled/
sudo certbot --nginx -d silkroutebrokerage.com -d www.silkroutebrokerage.com
sudo nginx -t && sudo systemctl reload nginx
```

### Pre-launch checklist
- [ ] `.env` filled in on the server (never committed) and `npm run check:smtp -- --send` delivered the test email
- [ ] `SITE_URL` is your real `https://` address; `NODE_ENV=production`; `TRUST_PROXY=1` behind a proxy/host
- [ ] DNS points to the host and HTTPS works for both `silkroutebrokerage.com` and `www`
- [ ] `/healthz` returns `{"status":"ok"}`
- [ ] One real quote submitted from a phone and a computer: email received, reply goes to the customer
- [ ] Domain in `public/sitemap.xml`, `public/robots.txt`, `<link rel="canonical">` and the JSON-LD block in `public/index.html` matches your live domain
- [ ] Blog posts link to `silkroutefreightbrokerage.com` in 3 places. Confirm that is a domain you own (or change it in the `BODIES` data)
- [x] `og:image` is included (`public/og-image.png`, 1200x630). If your domain differs from `www.silkroutebrokerage.com`, update the two image URLs in `public/index.html`
- [ ] Optional: back up the `data/` folder

### After going live
- Open `https://yourdomain/healthz`. It should return `{"status":"ok"}`.
- Submit a real test quote and confirm the email arrives.
- Update the domain in `public/sitemap.xml` and `public/robots.txt` if it differs from `www.silkroutebrokerage.com`.
- Set `SITE_URL` to your real https URL.
- Quotes on disk are stored in plain text (`data/quotes.jsonl`), so back up that folder and restrict server access.

## 5. Editing site content

Everything is in `public/index.html`. At the top of its `<script>` block:
`MAIL` (the business email). Blog posts are in the `POSTS` array. Every email link on the site (footer, contact section, blog, quote fallback) opens a Gmail compose tab. Business details are listed in `docs/SITE-INFO.md`.

## 6. Security notes
- Helmet security headers with a Content-Security-Policy (the single-file site needs `'unsafe-inline'` for its inline script and style; images are limited to self, `data:` and `static.wixstatic.com` for blog thumbnails).
- Request size cap (20 KB), JSON-only API, rate limiting, input validation and sanitising, no server stack traces exposed, runs as a non-root user in Docker.
- To allow another site to call the API, add its origin to `ALLOWED_ORIGINS`.

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| Server exits at startup with "Invalid production configuration" | Add SMTP vars, or `STORE_ONLY=true` |
| Form shows "Your quote request is ready" (Open in Gmail button) instead of "Request sent" | The API returned an error. Check the server logs and run `npm run check:smtp` |
| Gmail "Invalid login" | Use an App Password, not your normal password |
| Everyone shares one IP / rate limit trips too early | Set `TRUST_PROXY=1` when behind a proxy |
