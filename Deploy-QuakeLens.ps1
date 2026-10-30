$ErrorActionPreference = "Stop"
$region = "us-east-1"
$stack = "quakelens"

Write-Host "Reading QuakeLens deployment outputs..."
$bucket = aws cloudformation describe-stacks --stack-name $stack --region $region --query "Stacks[0].Outputs[?OutputKey=='SiteBucketName'].OutputValue | [0]" --output text
$distribution = aws cloudformation describe-stacks --stack-name $stack --region $region --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue | [0]" --output text
$domain = aws cloudfront get-distribution --id $distribution --query "Distribution.DomainName" --output text

if ([string]::IsNullOrWhiteSpace($bucket) -or $bucket -eq "None") { throw "Could not find the S3 bucket output." }
if ([string]::IsNullOrWhiteSpace($distribution) -or $distribution -eq "None") { throw "Could not find the CloudFront distribution output." }

Write-Host "Retrieving the restricted Amazon Location key (value will not be printed)..."
$key = aws location describe-key --key-name "QuakeLensMapKey" --region $region --query "Key" --output text
if ([string]::IsNullOrWhiteSpace($key) -or $key -eq "None") { throw "Could not retrieve QuakeLensMapKey." }

$config = @{
    mapKey = $key
    region = $region
} | ConvertTo-Json -Compress

$configJs = "window.QUAKELENS_CONFIG = $config;"
$configPath = Join-Path $PSScriptRoot "site\config.js"
Set-Content -Path $configPath -Value $configJs -Encoding utf8
Remove-Variable key

Write-Host "Uploading site files to private S3 origin..."
aws s3 sync (Join-Path $PSScriptRoot "site") "s3://$bucket/" --delete --region $region
if ($LASTEXITCODE -ne 0) { throw "S3 upload failed." }

Write-Host "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $distribution --paths "/*"
if ($LASTEXITCODE -ne 0) { throw "CloudFront invalidation failed." }

Write-Host ""
Write-Host "Deployment submitted."
Write-Host "Website: https://$domain"
Write-Host "The API key is delivered to browsers as a public, restricted map key."
Write-Host "Do not commit site\config.js to Git."
