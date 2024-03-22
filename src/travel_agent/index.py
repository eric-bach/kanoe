import os
import requests
from aws_lambda_powertools import Logger

API_GATEWAY_URL = os.environ["API_GATEWAY_URL"]

logger = Logger()

@logger.inject_lambda_context(log_event=True)
def handler(event, context):
    api_path = event['apiPath']

    data = "Sorry, please try again later."

    parameters = event['parameters']
    if (api_path == '/airport/{city}'):
        logger.info('Get airport code by city')
        
        for parameter in parameters:
            if parameter["name"] == "city":
                city = parameter["value"]
        
        url = f"{API_GATEWAY_URL}airport/{city}"
        headers = {
            "content-type": "application/json"
        }

        response = requests.get(url, headers=headers)
        response.raise_for_status()

        logger.info(response.json())

        data = response.json()
    elif (api_path == '/flights/{departureId}/{arrivalId}/{date}'):
        logger.info('Get available flights')
        
        for parameter in parameters:
            if parameter["name"] == "departureId":
                departureId = parameter["value"]
            if parameter["name"] == "arrivalId":
                arrivalId = parameter["value"]
            if parameter["name"] == "date":
                date = parameter["value"]

        url = f"{API_GATEWAY_URL}flights/{departureId}/{arrivalId}/{date}"
        headers = {
            "content-type": "application/json"
        }

        response = requests.get(url, headers=headers)
        response.raise_for_status()

        logger.info(response.json())

        data = response.json()
    elif (api_path == '/flights/bookings/{id}'):
        logger.info('Booking flight')
        
        for parameter in parameters:
            if parameter["name"] == "memberId":
                memberId = parameter["value"]
            if parameter["name"] == "id":
                flightId = parameter["value"]
            
        url = f"{API_GATEWAY_URL}flights/bookings/{flightId}"
        headers = {
            "content-type": "application/json"
        }

        response = requests.post(url, headers=headers)
        response.raise_for_status()

        logger.info(response.json())

        data = response.json()

    # https://docs.aws.amazon.com/bedrock/latest/userguide/agents-lambda.html
    result = {
        'messageVersion': '1.0',
        'response': {
            'actionGroup': event['actionGroup'],
            'apiPath': event['apiPath'],
            'httpMethod': event['httpMethod'],
            'httpStatusCode': 200,
            'responseBody': {
                'application/json': {
                    'body': data
                }
            },
            'sessionAttributes': {},
            'promptSessionAttributes': {}
        }
    }

    logger.info(result)

    return result
