#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { KinesisStack } from "../lib/kinesis-stack";
import { DataProducerStack } from "../lib/data-producer-stack";
import { DataConsumerStack } from "../lib/data-consumer-stack";
import { GlueSMAStack } from "../lib/glue-sma-stack";

const ALPHA_VANTAGE_KEY: string = process.env.ALPHA_VANTAGE_KEY || "";
const INTRADAY_STREAM_NAME =
  process.env.INTRADAY_STREAM_NAME || "intraday-analytics-stream";
const DYNAMO_TABLE_NAME = process.env.DYNAMO_TABLE_NAME || "DataConsumerTable";
const GLUE_DATABASE_NAME = process.env.GLUE_DATABASE_NAME || "crypto_sma_db";
const GLUE_TABLE_NAME = process.env.GLUE_TABLE_NAME || "crypto_sma_table";
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "crypto-etl-data-bucket";
const S3_PREFIX = process.env.S3_PREFIX || "processed-data/";

const app = new cdk.App();

new KinesisStack(app, "KinesisStack", {
  streamName: INTRADAY_STREAM_NAME,
});

new DataProducerStack(app, "DataProducerStack", {
  streamName: INTRADAY_STREAM_NAME,
  alphaVantageKey: ALPHA_VANTAGE_KEY,
});

new DataConsumerStack(app, "DataConsumerStack", {
  streamName: INTRADAY_STREAM_NAME,
  tableName: DYNAMO_TABLE_NAME,
});

new GlueSMAStack(app, "GlueSMAStack", {
  databaseName: GLUE_DATABASE_NAME,
  tableName: GLUE_TABLE_NAME,
  s3BucketName: S3_BUCKET_NAME,
  s3Prefix: S3_PREFIX,
  dynamodbTableName: DYNAMO_TABLE_NAME,
});
