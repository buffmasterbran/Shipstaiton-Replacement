# CLI Deployment Complete! ✅

Your project is deployed via CLI. Now add environment variables.

## Your Deployment URLs

- **Preview URL**: `https://shipstation-replacement-clr2wrvt2-brandegee-pierces-projects.vercel.app`
- **Project Dashboard**: `https://vercel.com/brandegee-pierces-projects/shipstation-replacement`

## Next Step: Add Environment Variables

### Option 1: Via Vercel Dashboard (Recommended - Fastest)

1. Go to: https://vercel.com/brandegee-pierces-projects/shipstation-replacement/settings/environment-variables

2. Add these 3 variables (click "Add New" for each):

   **API_KEY**
   - Key: `API_KEY`
   - Value: `netsuite`
   - Environments: ✅ Production, ✅ Preview, ✅ Development

   **API_SECRET**
   - Key: `API_SECRET`
   - Value: `/YyZJKmy1w35Iu22YmFMHwLBxhOpqX9LpuJBLCcJWic=`
   - Environments: ✅ Production, ✅ Preview, ✅ Development

   **DATABASE_URL** (Temporary - update after Supabase)
   - Key: `DATABASE_URL`
   - Value: `postgresql://placeholder:placeholder@placeholder:5432/placeholder`
   - Environments: ✅ Production, ✅ Preview, ✅ Development

3. After adding all variables, redeploy:
   ```bash
   vercel --prod
   ```

### Option 2: Via CLI (Interactive)

Run these commands one at a time (you'll be prompted for values):

```bash
# Add API_KEY
vercel env add API_KEY production
# When prompted, enter: netsuite
# Repeat for preview and development:
vercel env add API_KEY preview
vercel env add API_KEY development

# Add API_SECRET
vercel env add API_SECRET production
# When prompted, enter: /YyZJKmy1w35Iu22YmFMHwLBxhOpqX9LpuJBLCcJWic=
# Repeat for preview and development:
vercel env add API_SECRET preview
vercel env add API_SECRET development

# Add DATABASE_URL (temporary)
vercel env add DATABASE_URL production
# When prompted, enter: postgresql://placeholder:placeholder@placeholder:5432/placeholder
# Repeat for preview and development:
vercel env add DATABASE_URL preview
vercel env add DATABASE_URL development
```

## Create Supabase

After environment variables are set:

1. Go to: https://vercel.com/brandegee-pierces-projects/shipstation-replacement/settings/integrations
2. Search for "Supabase" → Add Integration
3. Choose "Create a new Supabase project"
4. Fill in project details
5. Vercel will automatically update `DATABASE_URL`

## Redeploy After Supabase

Once Supabase is created and DATABASE_URL is updated:

```bash
vercel --prod
```

## Your Production URL

After redeploy, your production URL will be:
- `https://shipstation-replacement.vercel.app` (or similar)

## Update Git Separately

When you're ready to push to git:

```bash
git add .
git commit -m "Deployed to Vercel"
git push
```

This will link your git repo for automatic deployments going forward.



