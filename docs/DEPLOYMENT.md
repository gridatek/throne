# Deployment Guide

This project uses GitHub Actions to automatically deploy to Cloudflare Pages and Supabase on every push to the `main` branch.

## Architecture

- **Web App**: Deployed to Cloudflare Pages at `https://throne-web.pages.dev`
- **Admin App**: Deployed to Cloudflare Pages at `https://throne-admin.pages.dev`
- **Database**: Supabase (migrations automatically applied)

## Required GitHub Secrets

You need to configure the following secrets in your GitHub repository:

### Cloudflare Secrets

1. **`CLOUDFLARE_API_TOKEN`**
   - Navigate to Cloudflare Dashboard → My Profile → API Tokens
   - Create a new token with "Edit Cloudflare Pages" permissions
   - Copy the token value

2. **`CLOUDFLARE_ACCOUNT_ID`**
   - Navigate to Cloudflare Dashboard → Pages
   - Your Account ID is visible in the URL or the right sidebar
   - Format: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Supabase Secrets

3. **`SUPABASE_ACCESS_TOKEN`**
   - Navigate to Supabase Dashboard → Account → Access Tokens
   - Generate a new access token
   - Copy the token value

4. **`SUPABASE_PROJECT_REF`**
   - Navigate to your Supabase project
   - Found in Project Settings → General → Reference ID
   - Format: `abcdefghijklmnop` (16 characters)

5. **`SUPABASE_URL`**
   - Navigate to your Supabase project
   - Found in Project Settings → API → Project URL
   - Format: `https://abcdefghijklmnop.supabase.co`

6. **`SUPABASE_ANON_KEY`**
   - Navigate to your Supabase project
   - Found in Project Settings → API → Project API keys → anon public
   - Format: Long JWT token starting with `eyJ...`

7. **`SUPABASE_DB_PASSWORD`**
   - The database password you set when creating your Supabase project
   - If you don't remember it, you can reset it in Project Settings → Database

## Setting Up GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret listed above with its corresponding value

## Cloudflare Pages Projects

Before the first deployment, you need to create the Cloudflare Pages projects:

1. Go to Cloudflare Dashboard → Pages
2. Create a new project named `throne-web`
3. Create another project named `throne-admin`

Alternatively, the GitHub Action will create them automatically on first deployment.

## Manual Deployment

To trigger a manual deployment:

1. Go to your GitHub repository
2. Navigate to **Actions** → **Deploy to Production**
3. Click **Run workflow** → **Run workflow**

## Local Development

For local development, create config files:

### Web App Config
Create `apps/web/public/assets/config.json`:
```json
{
  "production": false,
  "supabase": {
    "url": "http://127.0.0.1:54321",
    "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
  }
}
```

### Admin App Config
Create `apps/admin/public/assets/config.json`:
```json
{
  "production": false,
  "supabase": {
    "url": "http://127.0.0.1:54321",
    "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
  }
}
```

## Verifying Deployment

After deployment completes:

1. Check the Actions tab for any errors
2. Visit the deployed URLs:
   - Web: `https://throne-web.pages.dev`
   - Admin: `https://throne-admin.pages.dev`
3. Verify database migrations in Supabase Dashboard → Database → Migrations

## Custom Domains

To use custom domains:

1. Go to Cloudflare Pages → Your Project → Custom domains
2. Add your domain (e.g., `app.yourdomain.com`)
3. Follow the DNS configuration instructions
4. Update the deployment summary URLs in `.github/workflows/deploy.yml`

## Troubleshooting

### Deployment fails at Supabase step
- Verify `SUPABASE_ACCESS_TOKEN` is valid
- Verify `SUPABASE_PROJECT_REF` matches your project
- Check Supabase Dashboard for any migration errors

### Cloudflare deployment fails
- Verify `CLOUDFLARE_API_TOKEN` has correct permissions
- Verify `CLOUDFLARE_ACCOUNT_ID` is correct
- Check that the build output directory exists (`dist/apps/web/browser`)

### App loads but can't connect to Supabase
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Check browser console for CORS or network errors
- Verify Supabase project is not paused

## Rolling Back

To roll back to a previous deployment:

1. Go to Cloudflare Pages → Your Project → Deployments
2. Find the deployment you want to roll back to
3. Click **⋯** → **Rollback to this deployment**
