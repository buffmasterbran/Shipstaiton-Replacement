# Environment variables

Set these in **two places**: local (`.env.local`) and Vercel (Project → Settings → Environment Variables).

---

## Required

| Variable | Where to get it | Notes |
|----------|-----------------|--------|
| `DATABASE_URL` | Supabase → **Connect** → **Transaction** (port 6543) | Must include `&pgbouncer=true` in the URL. See [SUPABASE_CONNECTION.md](./SUPABASE_CONNECTION.md). |

---

## Optional (used by specific features)

| Variable | Used by | Where to get it |
|----------|---------|------------------|
| `POSTGRES_PRISMA_URL` | Prisma in **production** (Vercel) | Same as `DATABASE_URL`. Set in Vercel so the app prefers the pooler. |
| `API_KEY` | Ingest API (`/api/ingest-batch`) – NetSuite auth | Your chosen shared secret (e.g. generate with `node scripts/generate-api-secret.js`). |
| `API_SECRET` | Ingest API – NetSuite auth | Your chosen shared secret (same script). |
| `SHIPENGINE_API_KEY` | ShipEngine create-label / get-services | ShipEngine dashboard → API key. App has a test fallback if unset. |
| `SHIPSTATION_API_KEY` | ShipStation create-order | ShipStation account → API. |
| `SHIPSTATION_API_SECRET` | ShipStation create-order | ShipStation account → API. |

---

## Local

1. Copy `.env.example` to `.env.local`.
2. Replace placeholders with real values (at least `DATABASE_URL`).
3. Restart dev server. Run `node scripts/test-db-connection.js` to verify DB.

---

## Vercel

1. Vercel dashboard → your project → **Settings** → **Environment Variables**.
2. Add the same names and values. For production you want at least:
   - `DATABASE_URL` (or `POSTGRES_PRISMA_URL`) = Supabase Transaction pooler URL with `pgbouncer=true`
   - `API_KEY` / `API_SECRET` if you use the ingest API
3. Redeploy (push to git or **Deployments** → Redeploy).

---

## Checklist

- [ ] `.env.local` has `DATABASE_URL` (Supabase Transaction URL, port 6543, `pgbouncer=true`).
- [ ] Optional: `API_KEY`, `API_SECRET` for ingest; `SHIPENGINE_API_KEY`, `SHIPSTATION_*` if you use those features.
- [ ] Vercel env vars match (at least `DATABASE_URL` or `POSTGRES_PRISMA_URL` for production).
- [ ] `node scripts/test-db-connection.js` succeeds locally.
