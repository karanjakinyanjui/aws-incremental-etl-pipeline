#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { KinesisStack } from "../lib/kinesis-stack";
import { DataProducerStack } from "../lib/data-producer-stack";
import { DataConsumerStack } from "../lib/data-consumer-stack";

const ALPHA_VANTAGE_KEY: string = process.env.ALPHA_VANTAGE_KEY || "";
const INTRADAY_STREAM_NAME =
  process.env.INTRADAY_STREAM_NAME || "intraday-analytics-stream";
const DYNAMO_TABLE_NAME = process.env.DYNAMO_TABLE_NAME || "DataConsumerTable";

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
