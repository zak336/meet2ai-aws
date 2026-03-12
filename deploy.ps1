Write-Host "🚀 Starting deployment..." -ForegroundColor Cyan

# Get AWS Account ID
Write-Host "`n📋 Getting AWS Account ID..." -ForegroundColor Yellow
$AccountId = aws sts get-caller-identity --query Account --output text
if (-not $AccountId) {
    Write-Host "❌ Failed to get AWS Account ID. Make sure AWS CLI is configured." -ForegroundColor Red
    exit 1
}
Write-Host "✅ AWS Account ID: $AccountId" -ForegroundColor Green

# Get CloudFront Distribution ID
Write-Host "`n📋 Getting CloudFront Distribution ID..." -ForegroundColor Yellow
$distributions = aws cloudfront list-distributions --output json | ConvertFrom-Json
$myDist = $distributions.DistributionList.Items | Where-Object { $_.Origins.Items[0].DomainName -like "*ai-classroom-frontend*" } | Select-Object -First 1
if ($myDist) {
    $DistId = $myDist.Id
    Write-Host "✅ CloudFront Distribution ID: $DistId" -ForegroundColor Green
} else {
    Write-Host "❌ CloudFront Distribution not found!" -ForegroundColor Red
    exit 1
}

# Build the app
Write-Host "`n📦 Building app..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build complete!" -ForegroundColor Green

# Sync to S3
Write-Host "`n☁️  Uploading to S3..." -ForegroundColor Yellow
$BucketName = "ai-classroom-frontend-$AccountId"
aws s3 sync dist/ "s3://$BucketName/" --delete
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ S3 sync failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Upload complete!" -ForegroundColor Green

# Invalidate CloudFront cache
Write-Host "`n🔄 Invalidating CloudFront cache..." -ForegroundColor Yellow
aws cloudfront create-invalidation --distribution-id $DistId --paths "/*"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ CloudFront invalidation failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Invalidation started!" -ForegroundColor Green

# Get CloudFront URL
$CloudFrontUrl = $myDist.DomainName

Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
Write-Host "🌐 Your site: https://$CloudFrontUrl" -ForegroundColor Cyan
Write-Host "`n⏳ Wait 2-5 minutes for CloudFront invalidation to complete" -ForegroundColor Yellow
