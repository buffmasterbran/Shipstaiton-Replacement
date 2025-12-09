# Add Missing Environment Variables to Vercel

Your Supabase is set up! Now add these 3 critical variables that Prisma needs.

## Go to Vercel Dashboard

**URL**: https://vercel.com/brandegee-pierces-projects/shipstation-replacement/settings/environment-variables

## Add These Variables

### 1. DATABASE_URL (Required for Prisma)

- **Key**: `DATABASE_URL`
- **Value**: `postgresql://postgres.exhbwnkpiviuxarooncp:bXGP1lysH8fRJ2wZ@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

**OR** you can use the POSTGRES_URL_NON_POOLING value that's already there (copy it).

### 2. API_KEY (Required for API Auth)

- **Key**: `API_KEY`
- **Value**: `netsuite`
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

### 3. API_SECRET (Required for API Auth)

- **Key**: `API_SECRET`
- **Value**: `/YyZJKmy1w35Iu22YmFMHwLBxhOpqX9LpuJBLCcJWic=`
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

## After Adding Variables

Redeploy your project:

```bash
vercel --prod
```

Or trigger a new deployment by pushing to git.

## Verify Database Schema

The database schema is already created! ✅

You can verify in Supabase:
1. Go to Supabase Dashboard → Table Editor
2. You should see `order_logs` table with columns:
   - id
   - order_number
   - status
   - raw_payload
   - created_at
   - updated_at

## Test Your API

After redeploy, test with:

```bash
npm run test:api https://shipstation-replacement.vercel.app netsuite /YyZJKmy1w35Iu22YmFMHwLBxhOpqX9LpuJBLCcJWic=
```

Or visit your dashboard:
`https://shipstation-replacement.vercel.app`




