# Devolve Motor Spares ERP

Inventory, sales, quotations, credit, cashbook and journals for Devolve Motor Spares.

The frontend (Vite + React) and the API (serverless functions in `api/`) are deployed together as **one Vercel project** with a single Deploy button.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ronaldmunyebvu/DevolveERP&project-name=devolve-erp&repository-name=DevolveERP&env=DATABASE_URL,JWT_SECRET,SESSION_SECRET,MAIL_USER,MAIL_APP_PASSWORD,APP_URL&envDescription=Add%20your%20Neon%20database%20URL%2C%20session%20secrets%2C%20Gmail%20app%20password%2C%20and%20deployed%20app%20URL.)

## Deploy

1. Click the deploy button above (or import the repo at `https://vercel.com/new`).
2. Fill in the environment variables when Vercel prompts you.
3. Accept the detected settings — root directory `.`, framework `Vite`, build `npm run build`, output `dist`.
4. Click **Deploy**.

There is no separate client or server project. `/api/*` is served by the single serverless function in `api/index.js`; everything else is the SPA in `dist/`.

## Environment variables

Set these in the Vercel project (Settings → Environment Variables) for Production, Preview and Development:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon pooled Postgres connection string (server only) |
| `JWT_SECRET` | Signs the httpOnly session cookie (32+ characters) |
| `SESSION_SECRET` | Same long random value as `JWT_SECRET` |
| `JWT_EXPIRES_IN` | Optional session lifetime, defaults to `12h` |
| `MAIL_USER` | Gmail account used for outgoing mail |
| `MAIL_APP_PASSWORD` | Google app password |
| `APP_URL` | Your Vercel URL, e.g. `https://your-project.vercel.app` |
| `DB_DRIVER` | Optional. Leave empty for TCP, or `neon` for WebSocket transport |

The deploy button prompts for `DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, `MAIL_USER`, `MAIL_APP_PASSWORD` and `APP_URL`. The optional variables have safe defaults. Copy `.env.example` as the reference. Never commit `.env`.

## Local development

```bash
npm ci
cp .env.example .env   # fill in real values
npm run dev            # web on :5173, API on :3000
npm run verify         # lint + production build
```
