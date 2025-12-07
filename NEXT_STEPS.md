# Next Steps: Get Your API Live 🚀

Follow these steps in order to get your shipping log API working:

## Step 1: Install Dependencies (if not done)

```bash
npm install
```

## Step 2: Generate Your API Credentials

Generate your API secret and choose an API key:

```bash
npm run generate:secret
```

**Save the output!** You'll need:
- **API_KEY**: Choose any string (e.g., "netsuite" or reuse your ShipStation key)
- **API_SECRET**: The generated secret from above

## Step 3: Set Up Supabase Database

### 3.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in or create account
3. Click **"New Project"**
4. Fill in:
   - Project Name: `shipstation-replacement` (or your choice)
   - Database Password: **Create a strong password** (save this!)
   - Region: Choose closest to you
5. Click **"Create new project"** (takes 1-2 minutes)

### 3.2 Get Database Connection String

1. In Supabase dashboard → **Settings** → **Database**
2. Scroll to **"Connection string"** → **"URI"**
3. Copy the connection string
4. It looks like: `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`
5. **Replace `[PASSWORD]`** with the password you created

### 3.3 Set Up Database Schema Locally

Create a `.env` file in your project root:

```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
API_KEY="netsuite"
API_SECRET="your-generated-secret-here"
```

Then push the schema:

```bash
npx prisma generate
npx prisma db push
```

This creates the `order_logs` table in Supabase.

## Step 4: Deploy to Vercel

### 4.1 Push Code to GitHub

If you haven't already:

```bash
git add .
git commit -m "Ready for deployment"
git push
```

### 4.2 Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Sign in (or create account)
3. Click **"Add New..."** → **"Project"**
4. Import your GitHub repository
5. Vercel auto-detects Next.js settings

### 4.3 Add Environment Variables

**Before clicking Deploy**, add these environment variables:

1. Click **"Environment Variables"** section
2. Add these 3 variables:

   **DATABASE_URL**
   - Value: Your Supabase connection string (from Step 3.2)
   - Example: `postgresql://postgres:yourpassword@db.xxxxx.supabase.co:5432/postgres`
   - ✅ Check: Production, Preview, Development

   **API_KEY**
   - Value: Your chosen API key (e.g., "netsuite")
   - ✅ Check: Production, Preview, Development

   **API_SECRET**
   - Value: Your generated secret (from Step 2)
   - ✅ Check: Production, Preview, Development

3. Click **"Deploy"**

### 4.4 Get Your Production URL

After deployment (takes 1-2 minutes), Vercel gives you:
- **Dashboard URL**: `https://your-project.vercel.app`
- **API Endpoint**: `https://your-project.vercel.app/api/ingest-batch`

**Save these URLs!**

## Step 5: Test Your API

Test with Basic Auth (same as ShipStation):

```bash
npm run test:api https://your-project.vercel.app your-api-key your-api-secret
```

You should see:
```json
{
  "success": true,
  "message": "Successfully ingested 1 order(s)",
  "count": 1
}
```

Then check your dashboard - you should see the test order!

## Step 6: Update Your NetSuite Script

1. Open your NetSuite script editor
2. Add the `sendOrderToCustomEndpoint` function (see `NETSUITE_INTEGRATION.md`)
3. Update the URL: `https://your-project.vercel.app/api/ingest-batch`
4. Use your API_KEY and API_SECRET (can reuse ShipStation credentials or create new ones)

## Step 7: Test End-to-End

1. Create a test shipment in NetSuite
2. Run your script
3. Check your dashboard: `https://your-project.vercel.app`
4. Verify the order appears in the logs

## ✅ Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] API credentials generated (`npm run generate:secret`)
- [ ] Supabase project created
- [ ] Database connection string obtained
- [ ] Database schema pushed (`npx prisma db push`)
- [ ] Code pushed to GitHub
- [ ] Vercel project created
- [ ] Environment variables added to Vercel (DATABASE_URL, API_KEY, API_SECRET)
- [ ] Vercel deployment successful
- [ ] API endpoint tested
- [ ] NetSuite script updated
- [ ] End-to-end test successful

## 🆘 Troubleshooting

**Database connection issues?**
- Verify DATABASE_URL has correct password
- Check Supabase project is active
- Ensure password is URL-encoded if it has special characters

**API authentication fails?**
- Verify API_KEY and API_SECRET match in Vercel
- Check you're using Basic Auth format: `base64(apiKey:apiSecret)`
- Test with: `npm run test:api`

**Deployment fails?**
- Check Vercel build logs
- Ensure all environment variables are set
- Verify Prisma generates correctly (check `postinstall` script)

**Need help?**
- See `DEPLOYMENT.md` for detailed troubleshooting
- Check Vercel function logs in dashboard
- Verify Supabase connection in Supabase dashboard

## 🎉 You're Done!

Once all steps are complete, your API will:
- Accept orders from NetSuite using Basic Auth
- Store them in Supabase
- Display them in your dashboard

Your production API URL: `https://your-project.vercel.app/api/ingest-batch`

