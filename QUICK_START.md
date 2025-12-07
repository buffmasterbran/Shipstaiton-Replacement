# Quick Start: Get Your Real API & Credentials

Follow these steps to get your production API URL and credentials set up.

## 🚀 Quick Steps

### 1. Generate Your API Secret

```bash
npm run generate:secret
```

Copy the generated secret - you'll need it for both Vercel and NetSuite.

### 2. Get Your Supabase Database URL

1. Go to [supabase.com](https://supabase.com) → Create/Open your project
2. Navigate to **Settings** → **Database**
3. Find **"Connection string"** → **"URI"**
4. Copy the connection string (looks like):
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
   ```
5. Replace `[PASSWORD]` with your database password

### 3. Set Up Database Schema

Create a `.env` file locally:
```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
API_SECRET="your-generated-secret-here"
```

Then run:
```bash
npm install
npx prisma db push
```

This creates the `order_logs` table in Supabase.

### 4. Deploy to Vercel

1. **Push to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push
   ```

2. **Import to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repo

3. **Add Environment Variables** in Vercel:
   - `DATABASE_URL` = Your Supabase connection string
   - `API_SECRET` = Your generated secret from step 1
   - ✅ Check all environments (Production, Preview, Development)

4. **Deploy!**

### 5. Get Your Production API URL

After deployment, Vercel gives you a URL like:
```
https://your-project.vercel.app
```

Your API endpoint will be:
```
https://your-project.vercel.app/api/ingest-batch
```

### 6. Test Your API

```bash
npm run test:api https://your-project.vercel.app YOUR_API_SECRET
```

Or test manually:
```bash
curl -X POST https://your-project.vercel.app/api/ingest-batch \
  -H "Content-Type: application/json" \
  -H "x-api-secret: YOUR_API_SECRET" \
  -d '{"order_number": "TEST-001", "customer": "Test"}'
```

### 7. Configure NetSuite

In your NetSuite Scheduled Script:

- **URL**: `https://your-project.vercel.app/api/ingest-batch`
- **Header**: `x-api-secret: YOUR_API_SECRET`
- **Method**: POST
- **Content-Type**: application/json

## 📋 Credentials Checklist

- [ ] API Secret generated (`npm run generate:secret`)
- [ ] Supabase Database URL obtained
- [ ] Database schema pushed (`npx prisma db push`)
- [ ] Vercel project created
- [ ] Environment variables added to Vercel
- [ ] Deployment successful
- [ ] API endpoint tested
- [ ] NetSuite script configured

## 🔗 Your Production URLs

Once deployed, save these:

- **Dashboard**: `https://your-project.vercel.app`
- **API Endpoint**: `https://your-project.vercel.app/api/ingest-batch`
- **API Secret**: `[Your generated secret]`

## 🆘 Need Help?

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed troubleshooting and advanced configuration.

