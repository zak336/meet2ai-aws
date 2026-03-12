#!/bin/bash

echo "=== Finding Your AWS Account ID ==="
aws sts get-caller-identity --query Account --output text

echo ""
echo "=== Finding Your CloudFront Distribution ID ==="
aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='AI Classroom - Complete Infrastructure (eu-north-1)' || Origins.Items[0].DomainName contains 'ai-classroom-frontend'].Id" --output text

echo ""
echo "=== Finding Your S3 Bucket Name ==="
aws s3 ls | grep ai-classroom-frontend

echo ""
echo "=== Your CloudFront URL ==="
aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='AI Classroom - Complete Infrastructure (eu-north-1)' || Origins.Items[0].DomainName contains 'ai-classroom-frontend'].DomainName" --output text
