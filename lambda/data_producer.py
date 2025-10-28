import os
from alpha_vantage.foreignexchange import ForeignExchange
from datetime import datetime
import json
import boto3

kinesis_client = boto3.client('kinesis')
secrets_client = boto3.client('secretsmanager')
stream_name = os.getenv('STREAM_NAME') or 'default_stream_name'

# Fetch API key from Secrets Manager
def get_alpha_vantage_key():
    secret_arn = os.getenv('ALPHA_VANTAGE_SECRET_ARN')
    if not secret_arn:
        raise ValueError("ALPHA_VANTAGE_SECRET_ARN environment variable is not set")

    response = secrets_client.get_secret_value(SecretId=secret_arn)
    return response['SecretString']

# Cache the API key to avoid repeated calls to Secrets Manager
alpha_vantage_key = get_alpha_vantage_key()

def parseFloat(value):
    try:
        return float(value)
    except (ValueError, TypeError):
        return value

def cleanup(object):
    res = {}
    for key, value in object.items():
        res[key.split('.')[-1].strip().replace(" ", "_").lower()] = parseFloat(value)
    return res


def fetch_exchange_rate(event):
    fx = ForeignExchange(key=alpha_vantage_key)
    conversion_pairs = event['conversion']
    from_symbol = conversion_pairs['from']
    to_symbol = conversion_pairs['to']

    data, _ = fx.get_currency_exchange_rate(from_symbol, to_symbol)
    slugified_data = cleanup(data)

    slugified_data.update({
        'timestamp': datetime.now().isoformat(),
        'from_symbol': from_symbol,
        'to_symbol': to_symbol,
        'ticker': f"{from_symbol}/{to_symbol}"
    })

    return slugified_data

def handle_event(event):
    record = fetch_exchange_rate(event)
    date_timestamp = record['last_refreshed'][0:10]

    kinesis_client.put_record(
        StreamName=stream_name,
        Data=json.dumps(record),
        PartitionKey=date_timestamp
    )
    return record


def lambda_handler(event, context):
    record = handle_event(event)

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Data sent to Kinesis stream successfully!',
            'last_refreshed': record['last_refreshed'],
            'from_symbol': record['from_symbol'],
            'to_symbol': record['to_symbol'],
        })
    }

