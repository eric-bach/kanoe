import os
import json
import requests
from aws_lambda_powertools import Logger

API_GATEWAY_URL = os.environ["API_GATEWAY_URL"]

logger = Logger()

def return_member_info(memberNumber):
    url = f"{API_GATEWAY_URL}member/{memberNumber}"
    headers = {
        "Content-Type": "application/json"
    }

    print(url)

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    print(response.json())

    return response.json()

@logger.inject_lambda_context(log_event=True)
def handler(event, context):
    api_path = event['apiPath']
    
    if api_path == '/member/{MemberNumber}':
        parameters = event['parameters']
        for parameter in parameters:
            if parameter["name"] == "MemberNumber":
                memberNumber = parameter["value"]
        body = return_member_info(memberNumber)
    else:
        body = {"{} is not a valid api, try another one.".format(api_path)}

    # https://docs.aws.amazon.com/bedrock/latest/userguide/agents-lambda.html
    response_body = {
        'application/json': {
            'body': body
        }
    }
    response = {
        'messageVersion': '1.0',
        'response': {
            'actionGroup': event['actionGroup'],
            'apiPath': event['apiPath'],
            'httpMethod': event['httpMethod'],
            'httpStatusCode': 200,
            'responseBody': response_body,
            'sessionAttributes': {},
            'promptSessionAttributes': {}
        }
    }

    return response
