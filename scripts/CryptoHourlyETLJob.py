import sys
import boto3
from boto3.dynamodb.conditions import Key
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
import pyspark.sql.functions as F
from pyspark.sql.window import Window
from datetime import datetime, timedelta

args = getResolvedOptions(sys.argv, ["JOB_NAME", "DYNAMODB_TABLE_NAME", "LOCATION"])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args["JOB_NAME"], args)
spark.conf.set("spark.sql.sources.partitionOverwriteMode", "dynamic")

HOURS = 2
START_DATE = (datetime.now() - timedelta(hours=HOURS)).strftime("%Y-%m-%d %H:00:00")
END_DATE = datetime.now().strftime("%Y-%m-%d %H:00:00")
LOCATION = args["LOCATION"]

DYNAMODB_TABLE_NAME = args["DYNAMODB_TABLE_NAME"] 


def get_dynamodb_data(start_date, end_date):
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(DYNAMODB_TABLE_NAME)
    filter_expression = Key("last_refreshed").between(start_date, end_date)
    response = table.scan(FilterExpression=filter_expression)
    return response["Items"]


def create_df_from_items(items: list):
    rdd = sc.parallelize(items)
    df = rdd.toDF()
    return df


def string_to_timestamp(df, col_name: str):
    return df.withColumn(col_name, F.to_timestamp(col_name))


def add_sma(df, column: str, period: int, partition_col: str, sort_col: str):
    col_name = f"sma_{period}"
    return df.withColumn(
        col_name,
        F.avg(column).over(
            Window.partitionBy(F.col(partition_col))
            .orderBy(F.col(sort_col))
            .rowsBetween(-period, 0)
        ),
    )


def add_sma_cols(df):
    for period in [10, 30, 60, 100]:
        df = add_sma(df, "bid_price", period, "ticker", "last_refreshed")
    return df


def add_partition_cols(df):
    return df.withColumn("date", F.to_date("last_refreshed")).withColumn(
        "hour", F.format_string("%02d", F.hour("last_refreshed"))
    )


def write_df(df):
    df.write.partitionBy("ticker", "date", "hour").mode("overwrite").format(
        "parquet"
    ).save(LOCATION)


items = get_dynamodb_data(START_DATE, END_DATE)
df = create_df_from_items(items)
df = string_to_timestamp(df, "last_refreshed")
df = add_sma_cols(df)
df = add_partition_cols(df)
write_df(df)

job.commit()
