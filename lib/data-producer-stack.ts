import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface DataProducerStackProps extends cdk.StackProps {
  streamName: string;
  alphaVantageKey: string;
}

const CRYPTO_CONVERSIONS = [
  { from: "BTC", to: "USD" },
  { from: "ETH", to: "USD" },
  { from: "DOGE", to: "USD" },
];

export class DataProducerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DataProducerStackProps) {
    super(scope, id, props);

    const kinesisStreamArn = `arn:aws:kinesis:${this.region}:${this.account}:stream/${props.streamName}`;

    const alpha_vantage_layer = new cdk.aws_lambda.LayerVersion(
      this,
      "AlphaVantageLayer",
      {
        code: cdk.aws_lambda.Code.fromAsset(
          "lambda/layers/alpha_phantage_layer"
        ),
        compatibleRuntimes: [cdk.aws_lambda.Runtime.PYTHON_3_12],
        description: "Layer containing Alpha Vantage library",
      }
    );

    const keySecret = new cdk.aws_secretsmanager.Secret(
      this,
      "AlphaVantageApiKeySecret",
      {
        secretName: "AlphaVantageApiKey",
        description: "API Key for Alpha Vantage",
        secretStringValue: cdk.SecretValue.unsafePlainText(
          props.alphaVantageKey
        ),
      }
    );

    const lambdaFunction = new cdk.aws_lambda.Function(
      this,
      "DataProducerFunction",
      {
        runtime: cdk.aws_lambda.Runtime.PYTHON_3_12,
        handler: "data_producer.handler",
        layers: [alpha_vantage_layer],
        code: cdk.aws_lambda.Code.fromAsset("lambda"),
        environment: {
          STREAM_NAME: props.streamName,
          ALPHA_VANTAGE_SECRET_ARN: keySecret.secretArn,
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["kinesis:PutRecord", "kinesis:PutRecords"],
        resources: [kinesisStreamArn],
      })
    );

    keySecret.grantRead(lambdaFunction);

    CRYPTO_CONVERSIONS.map(
      (conversion) =>
        new cdk.aws_events.Rule(
          this,
          `ScheduleRule-${conversion.from}-${conversion.to}`,
          {
            schedule: cdk.aws_events.Schedule.rate(cdk.Duration.minutes(1)),
            targets: [
              new cdk.aws_events_targets.LambdaFunction(lambdaFunction, {
                event: cdk.aws_events.RuleTargetInput.fromObject({
                  conversion,
                }),
              }),
            ],
          }
        )
    );
  }
}
