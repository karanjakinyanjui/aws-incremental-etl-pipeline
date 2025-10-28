# AWS Glue ETL Pipeline Setup

This document describes the AWS Glue stack that processes cryptocurrency data from DynamoDB and calculates Simple Moving Averages (SMA).

## Overview

The Glue stack creates:
- AWS Glue Database and Table (Parquet format with partitions)
- AWS Glue Job that runs the ETL script
- EventBridge rule to trigger the job hourly
- IAM role with necessary permissions

## Architecture

```
DynamoDB (DataConsumerTable)
    ↓
Glue Job (CryptoHourlyETLJob) - Runs hourly via EventBridge
    ↓
S3 (Parquet files partitioned by ticker/date/hour)
    ↓
Glue Catalog Table (for querying with Athena)
```

## Components

### 1. Glue Database
- **Name**: `crypto_sma_db` (configurable via `GLUE_DATABASE_NAME` env var)
- Catalog for storing table metadata

### 2. Glue Table
- **Name**: `crypto_sma_table` (configurable via `GLUE_TABLE_NAME` env var)
- **Format**: Parquet
- **Partitions**: `ticker`, `date`, `hour`
- **Columns**:
  - `ask_price` (double)
  - `bid_price` (double)
  - `last_refreshed` (timestamp)
  - `sma_10` (double) - 10-period SMA
  - `sma_30` (double) - 30-period SMA
  - `sma_60` (double) - 60-period SMA
  - `sma_100` (double) - 100-period SMA

### 3. Glue ETL Job
- **Script**: `scripts/CryptoHourlyETLJob.py`
- **Glue Version**: 4.0
- **Worker Type**: G.1X
- **Number of Workers**: 2
- **Timeout**: 60 minutes
- **What it does**:
  1. Reads data from DynamoDB (last 2 hours)
  2. Calculates SMAs (10, 30, 60, 100 periods)
  3. Writes to S3 as partitioned Parquet files

### 4. EventBridge Schedule
- **Frequency**: Every hour at the 10th minute (e.g., 1:10, 2:10, 3:10, etc.)
- **Cron Expression**: `10 * * * ? *`
- **Action**: Starts the Glue job automatically
- Can be disabled/modified in AWS Console if needed

## Environment Variables

Configure these in your environment or `.env` file:

```bash
# Required
DYNAMO_TABLE_NAME=DataConsumerTable
S3_BUCKET_NAME=crypto-etl-data-bucket

# Optional (have defaults)
GLUE_DATABASE_NAME=crypto_sma_db
GLUE_TABLE_NAME=crypto_sma_table
S3_PREFIX=processed-data/
```

## Deployment

### 1. Create S3 Bucket (if not exists)
```bash
aws s3 mb s3://crypto-etl-data-bucket
```

### 2. Upload Glue Script
The GitHub Actions workflow automatically uploads the script, or manually:
```bash
aws s3 cp scripts/CryptoHourlyETLJob.py s3://crypto-etl-data-bucket/scripts/CryptoHourlyETLJob.py
```

### 3. Deploy Stack
```bash
npm run build
npx cdk deploy GlueSMAStack
```

## Manual Job Execution

To manually trigger the job (for testing):
```bash
aws glue start-job-run --job-name CryptoHourlyETLJob
```

## Querying Data with Athena

Once data is processed, query it with Athena:

```sql
-- View all data
SELECT * FROM crypto_sma_db.crypto_sma_table
LIMIT 10;

-- Get latest SMAs for a specific ticker
SELECT
    ticker,
    last_refreshed,
    bid_price,
    sma_10,
    sma_30,
    sma_60,
    sma_100
FROM crypto_sma_db.crypto_sma_table
WHERE ticker = 'BTCUSD'
  AND date = CURRENT_DATE
ORDER BY last_refreshed DESC;

-- Check when SMAs cross (potential trading signals)
SELECT
    ticker,
    last_refreshed,
    bid_price,
    sma_10,
    sma_30,
    CASE
        WHEN sma_10 > sma_30 THEN 'Bullish'
        ELSE 'Bearish'
    END as signal
FROM crypto_sma_db.crypto_sma_table
WHERE date >= CURRENT_DATE - INTERVAL '7' DAY
ORDER BY ticker, last_refreshed;
```

## Monitoring

### CloudWatch Logs
View job execution logs in CloudWatch:
- Log group: `/aws-glue/jobs/CryptoHourlyETLJob`

### Glue Console
Monitor job runs in AWS Glue Console:
1. Go to AWS Glue → Jobs
2. Select `CryptoHourlyETLJob`
3. View run history and metrics

### EventBridge Rule
Check scheduled runs:
1. Go to EventBridge → Rules
2. Find rule (output in CDK deployment)
3. View metrics and invocation history

## Cost Optimization

- **DPU Hours**: Each run uses 2 G.1X workers (~$0.44/hour)
- **Hourly runs**: ~$316.80/month (24 hours × 30 days × $0.44)
- **Reduce costs by**:
  - Adjusting worker count/type
  - Changing schedule frequency
  - Optimizing script performance
  - Using smaller time windows

## Troubleshooting

### Job Fails Immediately
- Check S3 bucket exists and script is uploaded
- Verify IAM role has correct permissions
- Check CloudWatch Logs for errors

### No Data in S3
- Verify DynamoDB has data in the time range
- Check `HOURS` variable in script (default: 2 hours)
- Ensure DynamoDB table name is correct

### Permission Errors
- Glue role needs DynamoDB read access
- Glue role needs S3 read/write access
- Check IAM policies in AWS Console

### Partition Discovery
To refresh partitions in Athena:
```sql
MSCK REPAIR TABLE crypto_sma_db.crypto_sma_table;
```

Or use Glue Crawler for automatic partition discovery.
