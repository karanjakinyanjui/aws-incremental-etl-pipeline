# GitHub Actions Deployment Setup

This document explains how to configure GitHub Actions for automated deployment of the AWS Incremental ETL Pipeline.

## Required GitHub Secrets

Configure these secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

### Option 1: OIDC with IAM Role (Recommended)

This is the most secure method as it doesn't require long-lived credentials.

1. **AWS_ROLE_ARN**: The ARN of the IAM role that GitHub Actions will assume
   - Example: `arn:aws:iam::123456789012:role/GitHubActionsDeployRole`
   - This role must have permissions to deploy CDK stacks

2. **AWS_REGION**: The AWS region to deploy to
   - Example: `us-east-1`

3. **S3_BUCKET_NAME** (Optional): The S3 bucket name for storing Glue scripts and processed data
   - Example: `crypto-etl-data-bucket`
   - Default: `crypto-etl-data-bucket` (if not specified)
   - Note: This bucket must exist before deployment or be created manually

#### Setting up OIDC Trust

Create an IAM role in AWS with the following trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_USERNAME/aws-incremental-etl-pipeline:*"
        }
      }
    }
  ]
}
```

The role should have these AWS managed policies attached:
- `PowerUserAccess` (or more restrictive permissions for CDK deployment)
- Or create a custom policy with permissions for:
  - CloudFormation
  - Lambda
  - Kinesis
  - DynamoDB
  - Glue
  - S3
  - IAM (for creating service roles)
  - CloudWatch Logs

### Option 2: Access Keys (Less Secure)

If you can't use OIDC, you can use IAM user access keys:

1. **AWS_ACCESS_KEY_ID**: Your AWS access key ID
2. **AWS_SECRET_ACCESS_KEY**: Your AWS secret access key
3. **AWS_REGION**: The AWS region to deploy to

To use this method, update `.github/workflows/deploy.yml` and uncomment the access key lines:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ${{ secrets.AWS_REGION }}
```

## Workflow Triggers

The workflow runs on:
- **Push to main**: Automatically deploys changes to production
- **Pull requests**: Validates the CDK synth (but doesn't deploy)
- **Manual trigger**: Can be triggered manually from the Actions tab

## What the Workflow Does

1. Checks out the code
2. Sets up Python 3.12 and Node.js 22
3. Builds Lambda layers by running `build_layers.py`
4. Installs Node.js dependencies
5. Compiles TypeScript code
6. Configures AWS credentials
7. Runs CDK bootstrap (if needed)
8. Synthesizes CDK stacks
9. Uploads Glue ETL script to S3
10. Deploys all stacks to AWS (Kinesis, Lambda, DynamoDB, Glue)

## Testing the Workflow

To test without deploying to production:
1. Create a feature branch
2. Open a pull request
3. The workflow will run validation but skip deployment

## Troubleshooting

### CDK Bootstrap Errors
If you see bootstrap errors, ensure your AWS account has been bootstrapped for CDK:
```bash
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

### Permission Errors
Ensure the IAM role or user has sufficient permissions for all AWS services used in your stack.

### Layer Build Errors
Check that all `requirements.txt` files in `lambda/layers/*/requirements.txt` are valid and dependencies are available.
