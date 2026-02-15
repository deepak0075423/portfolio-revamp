# Deepak Portfolio (Express + JSON CMS)

This project serves the portfolio website using **Node.js + Express**, with all website text/data stored in `data/site.json` (no database).

## Setup

1) Install deps:

```bash
npm install
```

2) Create an admin user (stored in `data/users.json`):

```bash
npm run create-admin -- admin YourStrongPasswordHere
```

3) Create `.env` from `.env.example` and fill:
- `SESSION_SECRET`
- SMTP vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `CONTACT_TO`)

4) Start the server:

```bash
npm start
```

Open:
- Site: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

## Contact form (SMTP)

The contact form calls `POST /api/contact`. If SMTP isn’t configured, the API returns an error and the UI shows it.

## Production notes

- Set `NODE_ENV=production` and a strong `SESSION_SECRET`.
- Run behind HTTPS (cookie is `secure` in production).
- Keep `data/site.json` backed up (admin edits write to disk).

