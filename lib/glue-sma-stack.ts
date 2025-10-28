import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as glue from "aws-cdk-lib/aws-glue";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";

export interface GlueSMAStackProps extends cdk.StackProps {
  databaseName: string;
  tableName: string;
  s3BucketName: string;
  s3Prefix: string;
  dynamodbTableName: string;
}

export class GlueSMAStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GlueSMAStackProps) {
    super(scope, id, props);

    const glueDatabase = new cdk.aws_glue.CfnDatabase(this, "SMADatabase", {
      catalogId: this.account,
      databaseInput: {
        name: props.databaseName,
      },
    });

    // S3 bucket for storing processed data
    const bucket = s3.Bucket.fromBucketName(
      this,
      "SMAStagingBucket",
      props.s3BucketName
    );

    const s3Location = `s3://${props.s3BucketName}/${props.s3Prefix}`;

    // Glue table for Parquet data with partitions
    const glueTable = new cdk.aws_glue.CfnTable(this, "SMATable", {
      databaseName: glueDatabase.ref,
      catalogId: this.account,
      tableInput: {
        name: props.tableName,
        tableType: "EXTERNAL_TABLE",
        parameters: {
          classification: "parquet",
          compressionType: "none",
          typeOfData: "file",
        },
        partitionKeys: [
          { name: "ticker", type: "string" },
          { name: "date", type: "date" },
          { name: "hour", type: "string" },
        ],
        storageDescriptor: {
          columns: [
            { name: "ask_price", type: "double" },
            { name: "bid_price", type: "double" },
            { name: "last_refreshed", type: "timestamp" },
            { name: "sma_10", type: "double" },
            { name: "sma_30", type: "double" },
            { name: "sma_60", type: "double" },
            { name: "sma_100", type: "double" },
          ],
          location: s3Location,
          inputFormat: "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
          outputFormat:
            "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
          serdeInfo: {
            serializationLibrary:
              "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
          },
        },
      },
    });

    glueTable.addDependency(glueDatabase);

    // IAM role for Glue job
    const glueRole = new iam.Role(this, "GlueJobRole", {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSGlueServiceRole"
        ),
      ],
    });

    // Grant permissions to read from DynamoDB
    glueRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:BatchGetItem",
        ],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.dynamodbTableName}`,
        ],
      })
    );

    // Grant permissions to write to S3
    bucket.grantReadWrite(glueRole);

    // Upload Glue script to S3
    const scriptLocation = `s3://${props.s3BucketName}/scripts/CryptoHourlyETLJob.py`;

    // Glue Job
    const glueJob = new glue.CfnJob(this, "CryptoHourlyETLJob", {
      name: "CryptoHourlyETLJob",
      role: glueRole.roleArn,
      command: {
        name: "glueetl",
        pythonVersion: "3",
        scriptLocation: scriptLocation,
      },
      defaultArguments: {
        "--job-language": "python",
        "--enable-metrics": "true",
        "--enable-spark-ui": "true",
        "--enable-continuous-cloudwatch-log": "true",
        "--DYNAMODB_TABLE_NAME": props.dynamodbTableName,
        "--LOCATION": s3Location,
      },
      glueVersion: "4.0",
      maxRetries: 0,
      timeout: 60,
      numberOfWorkers: 2,
      workerType: "G.1X",
    });

    // EventBridge rule to trigger Glue job hourly at the 10th minute
    const hourlyRule = new events.Rule(this, "HourlyGlueJobTrigger", {
      schedule: events.Schedule.cron({
        minute: "10",
        hour: "*",
        day: "*",
        month: "*",
        year: "*",
      }),
      description: "Triggers the Crypto Hourly ETL job every hour at the 10th minute",
    });

    // Add Glue job as target
    hourlyRule.addTarget(
      new targets.AwsApi({
        service: "Glue",
        action: "startJobRun",
        parameters: {
          JobName: glueJob.name,
        },
      })
    );

    // Grant EventBridge permission to start the Glue job
    glueRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["glue:StartJobRun"],
        resources: [
          `arn:aws:glue:${this.region}:${this.account}:job/${glueJob.name}`,
        ],
      })
    );

    // Output the Glue job name
    new cdk.CfnOutput(this, "GlueJobName", {
      value: glueJob.name!,
      description: "Name of the Glue ETL job",
    });

    new cdk.CfnOutput(this, "ScriptLocation", {
      value: scriptLocation,
      description: "S3 location where the Glue script should be uploaded",
    });

    new cdk.CfnOutput(this, "ScheduleRuleName", {
      value: hourlyRule.ruleName,
      description: "EventBridge rule that triggers the job hourly",
    });
  }
}
