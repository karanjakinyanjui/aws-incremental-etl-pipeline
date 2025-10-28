import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface KinesisStackProps extends cdk.StackProps {
  streamName: string;
}

export class KinesisStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: KinesisStackProps) {
    super(scope, id, props);

    new cdk.aws_kinesis.Stream(this, "IntradayAnalyticsStream", {
      streamName: props.streamName,
      shardCount: 1,
      retentionPeriod: cdk.Duration.hours(24),
    });
  }
}
