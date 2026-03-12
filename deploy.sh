#!/bin/bash

echo "🚀 Starting deployment..."

# Get AWS Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ AWS Account ID: $ACCOUNT_ID"

# Get CloudFront Distribution ID
DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Origins.Items[0].DomainName contains 'ai-classroom-frontend'].Id" --output text | head -n 1)
echo "✅ CloudFront Distribution ID: $DIST_ID"

# Build the app
echo ""
echo "📦 Building app..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Sync to S3
echo ""
echo "☁️  Uploading to S3..."
aws s3 sync dist/ s3://ai-classroom-frontend-${ACCOUNT_ID}/ --delete

if [ $? -ne 0 ]; then
    echo "❌ S3 sync failed!"
    exit 1
fi

# Invalidate CloudFront cache
echo ""
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"

if [ $? -ne 0 ]; then
    echo "❌ CloudFront invalidation failed!"
    exit 1
fi

echo ""
echo "✅ Deployment complete!"
echo "🌐 Your site: https://${DIST_ID}.cloudfront.net"
echo ""
echo "⏳ Wait 2-5 minutes for CloudFront invalidation to complete"
