Write-Host "=== Finding Your AWS Account ID ===" -ForegroundColor Cyan
$AccountId = aws sts get-caller-identity --query Account --output text
Write-Host "Account ID: $AccountId" -ForegroundColor Green

Write-Host "`n=== Finding Your CloudFront Distribution ID ===" -ForegroundColor Cyan
$distributions = aws cloudfront list-distributions --output json | ConvertFrom-Json
$myDist = $distributions.DistributionList.Items | Where-Object { $_.Origins.Items[0].DomainName -like "*ai-classroom-frontend*" } | Select-Object -First 1
if ($myDist) {
    $DistId = $myDist.Id
    $CloudFrontUrl = $myDist.DomainName
    Write-Host "Distribution ID: $DistId" -ForegroundColor Green
} else {
    Write-Host "Distribution ID: Not found" -ForegroundColor Yellow
    $DistId = ""
    $CloudFrontUrl = ""
}

Write-Host "`n=== Finding Your S3 Bucket Name ===" -ForegroundColor Cyan
aws s3 ls | Select-String "ai-classroom-frontend"

Write-Host "`n=== Your CloudFront URL ===" -ForegroundColor Cyan
if ($CloudFrontUrl) {
    Write-Host "https://$CloudFrontUrl" -ForegroundColor Green
} else {
    Write-Host "CloudFront URL: Not found" -ForegroundColor Yellow
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Account ID: $AccountId"
Write-Host "Distribution ID: $DistId"
Write-Host "S3 Bucket: ai-classroom-frontend-$AccountId"
Write-Host "CloudFront URL: https://$CloudFrontUrl"
