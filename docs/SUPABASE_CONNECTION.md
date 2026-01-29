# Supabase connection (Prisma only)

This app uses **Prisma** to talk to Postgres. You do **not** need the Supabase REST/Realtime API (the “API” connection in the dashboard); that’s for live editing and multi-server sync. Prisma is enough.

---

## Two connection types from Supabase that matter

In the Supabase dashboard: open your project → **Connect** (top of the left sidebar). You’ll see connection strings for:

| What to use it for | In dashboard | Port | Use in this app |
|--------------------|--------------|------|------------------|
| **Transaction pooler** | “Transaction” / Supavisor transaction | **6543** | Main app (Vercel + local). Best for serverless. |
| **Direct** (optional) | “Direct” | **5432** | Migrations / `db push` from a machine that can’t reach 6543. |

- **Session pooler** (port 5432 on pooler) is an alternative to Direct when you need IPv4; we don’t require it if Transaction works.
- **Data API / anon key** = REST/Realtime; we don’t use that for this app.

---

## What to copy from Supabase

1. **Transaction pooler (recommended for this app)**  
   - In **Connect** → choose the connection type that uses port **6543**.  
   - Copy the **URI** (starts with `postgres://` or `postgresql://`).  
   - It will look like:  
     `postgres://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`  
     (region might be `us-east-1`, host might be `aws-1-us-east-1.pooler.supabase.com`, etc.)

2. **Direct (optional, for migrations or when 6543 is blocked)**  
   - In **Connect** → **Direct**.  
   - Copy the URI, e.g.:  
     `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

---

## Env vars this app expects

| Variable | Required | Purpose |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Used by Prisma schema and runtime. Should be the **transaction pooler** URL (port 6543) for Vercel and local. |
| `POSTGRES_PRISMA_URL` | Optional | If set, the app uses this in **production** (Vercel) first, then falls back to `DATABASE_URL`. Same value as `DATABASE_URL` is fine. |

**Important for port 6543 (transaction mode):**  
Add `?pgbouncer=true` (or `&pgbouncer=true` if the URL already has `?`) so Prisma doesn’t use prepared statements. Example:

```bash
# Transaction pooler – required for serverless; use for local too if your network allows
DATABASE_URL="postgres://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
```

If your network blocks port 6543, you can try the **Direct** URL (5432) in `DATABASE_URL` for local only; Vercel should still use the pooler (6543).

---

## Checklist

- [ ] Supabase project → **Connect**.
- [ ] Copy **Transaction** pooler URI (port **6543**).
- [ ] Ensure `?pgbouncer=true` (or `&pgbouncer=true`) is in the URL.
- [ ] Put it in `.env.local` as `DATABASE_URL` (and optionally `POSTGRES_PRISMA_URL` with the same value).
- [ ] Run `node scripts/test-db-connection.js` to verify.

No Supabase API keys or REST URLs are needed for this app; Prisma is the only client.
