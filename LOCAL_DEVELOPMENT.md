# Local Development Setup

Follow these steps to run the application locally for testing.

## Prerequisites

- Node.js 18+ installed
- npm or yarn installed

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Database Connection (use the Prisma URL from Supabase)
DATABASE_URL="postgres://postgres.exhbwnkpiviuxarooncp:bXGP1lysH8fRJ2wZ@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"

# API Credentials (use your ShipStation credentials)
API_KEY="e285651ed9af45c9a19106f3a6efe949"
API_SECRET="2145c28bfce646bb824a6d4a8f1a0e51"
```

**Note:** `.env.local` is already in `.gitignore`, so it won't be committed to git.

## Step 3: Generate Prisma Client

```bash
npm run db:generate
```

## Step 4: Verify Database Connection

The database schema should already be set up in Supabase. If you need to push changes:

```bash
npm run db:push
```

## Step 5: Run Development Server

```bash
npm run dev
```

The application will start at: **http://localhost:3000**

## Testing the API Locally

Once the dev server is running, test the API:

```bash
npm run test:api http://localhost:3000 e285651ed9af45c9a19106f3a6efe949 2145c28bfce646bb824a6d4a8f1a0e51
```

## Viewing the Dashboard

Open your browser to: **http://localhost:3000**

You should see:
- All orders from Supabase
- Collapsible order cards (click to expand/collapse)
- Detailed order information
- Items, shipping addresses, totals

## Troubleshooting

### Database Connection Issues

If you get connection errors:
1. Verify your `DATABASE_URL` is correct
2. Check Supabase dashboard to ensure the project is active
3. Try using the direct connection URL instead:
   ```
   postgresql://postgres.exhbwnkpiviuxarooncp:bXGP1lysH8fRJ2wZ@db.exhbwnkpiviuxarooncp.supabase.co:5432/postgres?sslmode=require
   ```

### Port Already in Use

If port 3000 is taken:
```bash
npm run dev -- -p 3001
```

### Prisma Client Not Generated

```bash
npm run db:generate
```

## Hot Reload

The development server supports hot reload - changes to files will automatically refresh in the browser.

## Next Steps

- Test the API endpoint: `http://localhost:3000/api/ingest-batch`
- View the dashboard: `http://localhost:3000`
- Make UI changes and see them instantly

