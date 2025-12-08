# Deploy to Vercel First, Then Create Supabase

This guide walks you through deploying to Vercel, then creating Supabase directly from Vercel's integration.

## Step 1: Deploy to Vercel

### 1.1 Go to Vercel

1. Open [vercel.com](https://vercel.com)
2. Sign in (or create account if needed)
3. Click **"Add New..."** → **"Project"**

### 1.2 Import Your Repository

1. Find your repository: `buffmasterbran/Shipstaiton-Replacement`
2. Click **"Import"**

### 1.3 Configure Project Settings

Vercel should auto-detect:
- **Framework Preset**: Next.js ✅
- **Root Directory**: `./` ✅
- **Build Command**: `next build` ✅
- **Output Directory**: `.next` ✅

**Don't deploy yet!** We need to add environment variables first.

### 1.4 Add Environment Variables (Temporary)

We'll add these now, then update DATABASE_URL after creating Supabase:

1. Click **"Environment Variables"** section
2. Add these variables:

   **API_KEY**
   - Key: `API_KEY`
   - Value: `netsuite` (or your choice)
   - ✅ Check: Production, Preview, Development

   **API_SECRET**
   - Key: `API_SECRET`
   - Value: `/YyZJKmy1w35Iu22YmFMHwLBxhOpqX9LpuJBLCcJWic=`
   - ✅ Check: Production, Preview, Development

   **DATABASE_URL** (Temporary - we'll update this)
   - Key: `DATABASE_URL`
   - Value: `postgresql://placeholder:placeholder@placeholder:5432/placeholder`
   - ✅ Check: Production, Preview, Development
   - ⚠️ We'll update this after creating Supabase

3. Click **"Deploy"**

### 1.5 Wait for Deployment

- First deployment takes 2-3 minutes
- You'll see build logs in real-time
- Once complete, you'll get a URL like: `https://shipstaiton-replacement.vercel.app`

## Step 2: Create Supabase from Vercel

### 2.1 Open Vercel Project Settings

1. In your Vercel project dashboard
2. Go to **"Settings"** tab
3. Click **"Integrations"** in the left sidebar

### 2.2 Add Supabase Integration

1. Search for **"Supabase"** in integrations
2. Click **"Add Integration"**
3. Authorize Vercel to access Supabase
4. Choose **"Create a new Supabase project"**

### 2.3 Configure Supabase Project

Fill in:
- **Project Name**: `shipstation-replacement` (or your choice)
- **Database Password**: Create a strong password (save this!)
- **Region**: Choose closest to you
- **Plan**: Free tier is fine to start

Click **"Create Project"**

### 2.4 Wait for Supabase Creation

- Takes 1-2 minutes
- Vercel will automatically:
  - Create the Supabase project
  - Get the connection string
  - Add it as `DATABASE_URL` environment variable
  - Link it to your Vercel project

### 2.5 Verify Environment Variable

1. Go to **"Settings"** → **"Environment Variables"**
2. You should see `DATABASE_URL` updated with your Supabase connection string
3. It should look like: `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`

## Step 3: Set Up Database Schema

### 3.1 Get Your Database URL from Vercel

1. In Vercel → **Settings** → **Environment Variables**
2. Copy the `DATABASE_URL` value
3. Or get it from Supabase dashboard → **Settings** → **Database** → **Connection string** → **URI**

### 3.2 Set Up Schema Locally (Optional but Recommended)

Create a `.env` file locally:

```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
API_KEY="netsuite"
API_SECRET="/YyZJKmy1w35Iu22YmFMHwLBxhOpqX9LpuJBLCcJWic="
```

Then push the schema:

```bash
npx prisma db push
```

### 3.3 Or Use Supabase SQL Editor

1. Go to Supabase dashboard → **SQL Editor**
2. Click **"New query"**
3. Run this SQL:

```sql
-- Create order_logs table
CREATE TABLE IF NOT EXISTS order_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_logs_created_at ON order_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_order_logs_order_number ON order_logs(order_number);
```

## Step 4: Redeploy Vercel (if needed)

If you updated environment variables:

1. Go to **"Deployments"** tab
2. Click the **"..."** menu on latest deployment
3. Click **"Redeploy"**

Or push a new commit to trigger auto-deploy.

## Step 5: Test Your API

Your API endpoint: `https://your-project.vercel.app/api/ingest-batch`

Test with:

```bash
npm run test:api https://your-project.vercel.app netsuite /YyZJKmy1w35Iu22YmFMHwLBxhOpqX9LpuJBLCcJWic=
```

Or visit your dashboard: `https://your-project.vercel.app`

## ✅ Checklist

- [ ] Code pushed to GitHub
- [ ] Vercel project created
- [ ] Environment variables added (API_KEY, API_SECRET, temporary DATABASE_URL)
- [ ] First deployment successful
- [ ] Supabase integration added in Vercel
- [ ] Supabase project created
- [ ] DATABASE_URL automatically updated
- [ ] Database schema created (via Prisma or SQL)
- [ ] API tested successfully

## 🎉 You're Done!

Your API is now live and connected to Supabase!

- **Dashboard**: `https://your-project.vercel.app`
- **API**: `https://your-project.vercel.app/api/ingest-batch`
- **Credentials**: Use API_KEY and API_SECRET you set

Next: Update your NetSuite script (see `NETSUITE_INTEGRATION.md`)



