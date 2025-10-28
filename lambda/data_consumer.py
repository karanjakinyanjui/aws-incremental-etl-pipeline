from decimal import Decimal
import os
import json
import boto3
import base64

DYNAMODB_TABLE_NAME = os.getenv('DYNAMODB_TABLE_NAME') 

kinesis_client = boto3.client('kinesis')
dynamodb_client = boto3.client('dynamodb')
dynamodb_table = boto3.resource('dynamodb').Table(DYNAMODB_TABLE_NAME)

def process_record(record):
    b64_data = record['kinesis']['data']
    data = base64.b64decode(b64_data).decode('utf-8')
    item = json.loads(data, parse_float=Decimal)

    # Store the item in DynamoDB
    dynamodb_table.put_item(Item=item)

    kinesis_client.delete_record(
        StreamName=os.getenv('KINESIS_STREAM_NAME'),
        SequenceNumber=record['SequenceNumber']
    )

def lambda_handler(event, context):
    for record in event['Records']:
        process_record(record)

    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Records processed successfully'})
    }
