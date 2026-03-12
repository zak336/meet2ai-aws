# S3 + CloudFront Deployment Guide (No Lambda)

## What Changed
- Removed all Lambda/AppSync/DynamoDB infrastructure
- App now calls Gemini API directly from the browser
- Uses domain restriction to protect your API key
- Audio uses browser Web Speech API (no Polly needed)

## Step 1: Restrict Your Gemini API Key

### Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/apis/credentials
2. Select your project
3. Click on your Gemini API key (the one in `.env.local`)

### Set Application Restrictions
1. Under "Application restrictions", select **Websites (HTTP referrers)**
2. Click **Add an item**
3. Add your CloudFront URL with wildcard:
   ```
   https://d2a1z182z0qva3.cloudfront.net/*
   ```
4. For local testing, also add:
   ```
   http://localhost:*/*
   ```

### Set API Restrictions
1. Under "API restrictions", select **Restrict key**
2. From the dropdown, search and select:
   - ✅ **Generative Language API** (this is Gemini)
3. Make sure NO other APIs are selected
4. Click **Save**

### Verify Restriction
- Your key will now ONLY work from your CloudFront domain
- Even if someone steals it, they can't use it elsewhere
- Google will reject requests from other domains

## Step 2: Build Your App

```bash
# Install dependencies (if not done)
npm install

# Build for production
npm run build
```

This creates a `dist/` folder with your static files.

## Step 3: Deploy to S3

### Option A: Using AWS CLI
```bash
# Sync files to your S3 bucket
aws s3 sync dist/ s3://ai-classroom-frontend-YOUR_ACCOUNT_ID/ --delete

# Make sure bucket is configured for static website hosting
aws s3 website s3://ai-classroom-frontend-YOUR_ACCOUNT_ID/ \
  --index-document index.html \
  --error-document index.html
```

### Option B: Using AWS Console
1. Go to S3 Console
2. Open your bucket: `ai-classroom-frontend-YOUR_ACCOUNT_ID`
3. Click **Upload**
4. Drag all files from `dist/` folder
5. Click **Upload**

## Step 4: Invalidate CloudFront Cache

**CRITICAL:** CloudFront caches your old files. You must invalidate:

### Using AWS Console
1. Go to CloudFront Console
2. Select your distribution
3. Click **Invalidations** tab
4. Click **Create invalidation**
5. Enter: `/*`
6. Click **Create invalidation**
7. Wait 2-5 minutes for completion

### Using AWS CLI
```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

## Step 5: Test Your Deployment

1. Open your CloudFront URL: `https://d2a1z182z0qva3.cloudfront.net`
2. Open browser DevTools (F12) → Console tab
3. Try asking the AI a question
4. Check for errors:
   - ✅ Should see Gemini API calls succeeding
   - ❌ If you see "API key not configured", rebuild and redeploy
   - ❌ If you see "403 Forbidden", check your domain restriction

## Troubleshooting

### "API key not configured" error
- Make sure `.env.local` has `VITE_GEMINI_API_KEY=your_key`
- Rebuild: `npm run build`
- Redeploy to S3
- Invalidate CloudFront cache

### "403 Forbidden" from Gemini
- Check your API key restrictions in Google Cloud Console
- Make sure your CloudFront domain is whitelisted
- Try adding `https://*` temporarily to test (then restrict again)

### Changes not showing up
- You forgot to invalidate CloudFront cache
- Clear your browser cache (Ctrl+Shift+Delete)
- Try incognito/private browsing mode

## Cost Comparison

### Before (with Lambda):
- Lambda invocations: ~$0.20 per 1M requests
- DynamoDB: ~$1.25 per million writes
- S3 storage: ~$0.023 per GB
- Polly TTS: ~$4 per 1M characters
- **Total: ~$5-20/month** depending on usage

### After (static S3):
- S3 storage: ~$0.023 per GB
- CloudFront: ~$0.085 per GB transfer
- Gemini API: Pay-per-use (same as before)
- **Total: ~$1-5/month** for hosting

## Security Notes

- Your Gemini API key IS visible in the JavaScript bundle
- Domain restriction prevents abuse from other sites
- Sophisticated attackers can still spoof referrer headers
- For maximum security, consider adding user authentication
- Monitor your Gemini API usage in Google Cloud Console

## What You Don't Need Anymore

You can delete these AWS resources:
- ❌ Lambda functions (ai-classroom-ai-handler, websocket-handler)
- ❌ API Gateway (WebSocket API)
- ❌ DynamoDB tables (connections, cache)
- ❌ IAM roles for Lambda
- ❌ AppSync API

Keep these:
- ✅ S3 bucket (frontend hosting)
- ✅ CloudFront distribution (HTTPS + CDN)
- ✅ S3 bucket policy (public read access)
