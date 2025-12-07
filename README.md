# ShipStation Replacement - Shipping Log Application

A Next.js 14 application for receiving and viewing shipping logs from NetSuite.

## Features

- **Batch Order Ingestion API**: Accepts single or batch orders from NetSuite Scheduled Scripts
- **Dashboard UI**: View the last 50 order logs with expandable raw data
- **Security**: API secret validation for incoming requests
- **Real-time Refresh**: Update dashboard without full page reload

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **ORM**: Prisma
- **Styling**: TailwindCSS

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

   Required variables:
   - `DATABASE_URL`: Your Supabase PostgreSQL connection string
   - `API_KEY`: Your API key (for Basic Auth, can be any string)
   - `API_SECRET`: Secret key for API authentication

3. **Set up Prisma**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## API Endpoint

### POST `/api/ingest-batch`

Accepts batch orders from NetSuite.

**Headers**:
- `Content-Type: application/json`
- `Authorization: Basic <base64(apiKey:apiSecret)>` (recommended, same as ShipStation)
- OR `x-api-secret: <your-api-secret>` (backward compatibility)

**Body**: Single order object or array of up to 200 order objects

**Example**:
```json
{
  "order_number": "12345",
  "customer": "Acme Corp",
  "items": [...]
}
```

Or batch:
```json
[
  { "order_number": "12345", ... },
  { "order_number": "12346", ... }
]
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully ingested 2 order(s)",
  "count": 2
}
```

## Dashboard

The dashboard displays:
- Timestamp of when the order was received
- Order number
- Status (default: RECEIVED)
- Expandable raw payload view

Click "Refresh" to update the view without reloading the page.

## Deployment to Vercel

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on:
- Setting up Supabase database
- Deploying to Vercel
- Configuring environment variables
- Testing your API endpoint
- Troubleshooting common issues

### Quick Deploy Checklist

1. ✅ Create Supabase project and get `DATABASE_URL`
2. ✅ Generate secure `API_SECRET` (use `npm run generate:secret`)
3. ✅ Choose an `API_KEY` (can be any string, e.g., "netsuite")
4. ✅ Push code to GitHub
5. ✅ Import project in Vercel
6. ✅ Add environment variables in Vercel:
   - `DATABASE_URL` (from Supabase)
   - `API_KEY` (your chosen API key)
   - `API_SECRET` (your generated secret)
7. ✅ Deploy and test!

See [NETSUITE_INTEGRATION.md](./NETSUITE_INTEGRATION.md) for NetSuite script integration examples.


