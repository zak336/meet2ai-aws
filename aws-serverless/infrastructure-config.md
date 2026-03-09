# Enterprise AWS Serverless Infrastructure Configuration

## 1. IAM Policy for Lambda Orchestrator
Attach these permissions to the Lambda execution role:

### DynamoDB (Caching)
- `dynamodb:GetItem`
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`
- **Resource**: `arn:aws:dynamodb:REGION:ACCOUNT_ID:table/ai-cache`

### Amazon Polly (Text-to-Speech)
- `polly:SynthesizeSpeech`
- **Resource**: `*`

### Amazon S3 (Audio Storage)
- `s3:PutObject`
- `s3:GetObject`
- **Resource**: `arn:aws:s3:::meet2-ai-audio/*`

## 2. DynamoDB Table Configuration
- **Table Name**: `ai-cache`
- **Partition Key**: `promptHash` (String)
- **TTL Attribute**: `ttl` (Number)
- **Billing Mode**: `On-Demand` (Recommended for variable AI traffic)

## 3. S3 Bucket Configuration
- **Bucket Name**: `meet2-ai-audio`
- **Public Access**: Block all public access (Use Signed URLs for security)
- **Lifecycle Policy**: Auto-delete files after 7 days to match DynamoDB TTL.

## 4. AppSync Configuration
- **Authentication**: API Key (Development) or Amazon Cognito (Production)
- **Resolver**: Direct Lambda Resolver pointing to `lambda-orchestrator`.
