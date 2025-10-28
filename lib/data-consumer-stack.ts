import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface DataConsumerStackProps extends cdk.StackProps {
  streamName: string;
  tableName: string;
}

export class DataConsumerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DataConsumerStackProps) {
    super(scope, id, props);

    const kinesisStreamArn = `arn:aws:kinesis:${this.region}:${this.account}:stream/${props.streamName}`;

    const dynamoTable = new cdk.aws_dynamodb.Table(this, "DataConsumerTable", {
      tableName: props.tableName,
      partitionKey: {
        name: "ticker",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "last_refreshed",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const lambdaFunction = new cdk.aws_lambda.Function(
      this,
      "DataConsumerFunction",
      {
        runtime: cdk.aws_lambda.Runtime.PYTHON_3_12,
        handler: "data_consumer.handler",
        code: cdk.aws_lambda.Code.fromAsset("lambda"),
        environment: {
          STREAM_NAME: props.streamName,
          TABLE_NAME: props.tableName,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    const stream = cdk.aws_kinesis.Stream.fromStreamArn(
      this,
      "ImportedIntradayAnalyticsStream",
      kinesisStreamArn
    );

    stream.grantReadWrite(lambdaFunction);

    lambdaFunction.addEventSource(
      new cdk.aws_lambda_event_sources.KinesisEventSource(stream, {
        startingPosition: cdk.aws_lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 100,
        bisectBatchOnError: true,
        retryAttempts: 2,
      })
    );

    dynamoTable.grantWriteData(lambdaFunction);
  }
}
