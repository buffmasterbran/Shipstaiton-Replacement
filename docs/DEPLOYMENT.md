# Deployment Guide: Vercel + Supabase

This guide will walk you through deploying your shipping log application to Vercel and connecting it to Supabase.

## Step 1: Set Up Supabase Database

### 1.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account)
2. Click **"New Project"**
3. Fill in:
   - **Project Name**: `shipstation-replacement` (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"** (takes 1-2 minutes)

### 1.2 Get Your Database Connection String

1. In your Supabase project dashboard, go to **Settings** → **Database**
2. Scroll down to **"Connection string"** section
3. Under **"URI"**, copy the connection string
4. It will look like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the password you created
6. **Save this connection string** - you'll need it for Vercel

### 1.3 Run Prisma Migrations Locally (Optional but Recommended)

Before deploying, set up your database schema:

1. Create a `.env` file in your project root:
   ```bash
   DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
   API_SECRET="temporary-local-secret"
   ```

2. Generate Prisma client and push schema:
   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   ```

   This creates the `order_logs` table in your Supabase database.

## Step 2: Deploy to Vercel

### 2.1 Prepare Your Repository

1. Initialize git (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Push to GitHub (or GitLab/Bitbucket):
   - Create a new repository on GitHub
   - Push your code:
     ```bash
     git remote add origin https://github.com/yourusername/your-repo.git
     git branch -M main
     git push -u origin main
     ```

### 2.2 Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (or create account)
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Vercel will auto-detect Next.js settings

### 2.3 Configure Environment Variables in Vercel

**Before deploying**, add your environment variables:

1. In the Vercel project setup, go to **"Environment Variables"** section
2. Add these variables:

   **DATABASE_URL**
   - Value: Your Supabase connection string from Step 1.2
   - Example: `postgresql://postgres:yourpassword@db.xxxxx.supabase.co:5432/postgres`
   - Environments: Production, Preview, Development (check all)

   **API_KEY**
   - Value: Your API key (can be any string, e.g., "netsuite" or "shipstation-replacement")
   - Example: `netsuite` or `shipstation-replacement`
   - Environments: Production, Preview, Development (check all)

   **API_SECRET**
   - Value: Generate a secure random string (see below)
   - Example: `sk_live_abc123xyz789...` or use a password generator
   - Environments: Production, Preview, Development (check all)

   **Generate a secure API secret:**
   ```bash
   # Using the included script (recommended):
   npm run generate:secret
   
   # Or manually on Mac/Linux:
   openssl rand -base64 32
   
   # Or use an online generator:
   # https://randomkeygen.com/
   ```

   **Note**: The API supports HTTP Basic Authentication (same as ShipStation). Use `API_KEY:API_SECRET` format when sending requests.

3. Click **"Deploy"**

### 2.4 Verify Deployment

1. After deployment completes, Vercel will give you a URL like:
   `https://your-project.vercel.app`

2. Visit the URL - you should see your dashboard (empty table is expected)

3. Check the deployment logs for any errors

## Step 3: Test Your API Endpoint

### 3.1 Get Your Production API URL

Your API endpoint will be:
```
https://your-project.vercel.app/api/ingest-batch
```

### 3.2 Test with the Test Script

**Option 1: Using Basic Auth (recommended, same as ShipStation):**
```bash
npm run test:api https://your-project.vercel.app YOUR_API_KEY YOUR_API_SECRET
```

**Option 2: Using x-api-secret header (backward compatibility):**
```bash
npm run test:api https://your-project.vercel.app YOUR_API_SECRET --header
```

**Option 3: Using cURL with Basic Auth:**
```bash
# Encode credentials
CREDS=$(echo -n "YOUR_API_KEY:YOUR_API_SECRET" | base64)

curl -X POST https://your-project.vercel.app/api/ingest-batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $CREDS" \
  -d '{
    "order_number": "TEST-001",
    "customer": "Test Customer",
    "items": [{"sku": "ABC123", "quantity": 2}]
  }'
```

**Option 4: Using cURL with x-api-secret header:**
```bash
curl -X POST https://your-project.vercel.app/api/ingest-batch \
  -H "Content-Type: application/json" \
  -H "x-api-secret: YOUR_API_SECRET_HERE" \
  -d '{
    "order_number": "TEST-001",
    "customer": "Test Customer",
    "items": [{"sku": "ABC123", "quantity": 2}]
  }'
```

You should get a response:
```json
{
  "success": true,
  "message": "Successfully ingested 1 order(s)",
  "count": 1
}
```

### 3.3 Verify in Dashboard

1. Go to your Vercel dashboard URL
2. Click "Refresh" button
3. You should see your test order appear in the table

## Step 4: Configure NetSuite Integration

### 4.1 Update NetSuite Scheduled Script

In your NetSuite Scheduled Script, use:

- **URL**: `https://your-project.vercel.app/api/ingest-batch`
- **Method**: POST
- **Header**: `x-api-secret: YOUR_API_SECRET_HERE`
- **Content-Type**: `application/json`

### 4.2 Example NetSuite Script (pseudo-code)

```javascript
// NetSuite Scheduled Script Example
var url = 'https://your-project.vercel.app/api/ingest-batch';
var headers = {
    'Content-Type': 'application/json',
    'x-api-secret': 'YOUR_API_SECRET_HERE'
};

var orders = []; // Your order data
var payload = JSON.stringify(orders);

var response = https.post({
    url: url,
    body: payload,
    headers: headers
});
```

## Troubleshooting

### Database Connection Issues

- **Error**: "Can't reach database server"
  - Check your `DATABASE_URL` in Vercel environment variables
  - Verify Supabase project is active
  - Ensure password is correct (no spaces, URL-encoded if needed)

### Prisma Client Issues

- **Error**: "Prisma Client not generated"
  - Vercel should auto-run `postinstall` script
  - Check build logs in Vercel dashboard
  - Manually trigger rebuild if needed

### API Secret Issues

- **Error**: "Unauthorized: Invalid API secret"
  - Verify `API_SECRET` matches in Vercel env vars
  - Check header name is exactly `x-api-secret` (case-sensitive)
  - Ensure no extra spaces in environment variable

### View Logs

- Vercel Dashboard → Your Project → **"Deployments"** → Click deployment → **"Functions"** tab
- Check server logs for detailed error messages

## Security Best Practices

1. **Never commit** `.env` files to git
2. **Rotate API secrets** periodically
3. **Use different secrets** for Production vs Preview environments
4. **Enable Vercel Authentication** if you want to protect the dashboard
5. **Set up Supabase Row Level Security** if needed for multi-tenant scenarios

## Next Steps

- Set up monitoring/alerting for failed API calls
- Add rate limiting if needed
- Configure custom domain in Vercel
- Set up database backups in Supabase

