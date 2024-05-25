import boto3
import json
import os
from aws_lambda_powertools import Logger

TABLE_NAME = os.environ["TABLE_NAME"]
AGENT_ID = os.environ["AGENT_ID"]

ddb_client = boto3.client("dynamodb")
ddb = boto3.resource("dynamodb")
table = ddb.Table(TABLE_NAME)

logger = Logger()

@logger.inject_lambda_context(log_event=True)
def handler(event, context):
    event_body = json.loads(event["body"])
    foundationModel = event_body["foundationModel"]

    logger.info(foundationModel)    

    # Default to Haiku
    if foundationModel != "anthropic.claude-v2:1" and foundationModel != "anthropic.claude-3-sonnet-20240229-v1:0" and foundationModel != "anthropic.claude-3-haiku-20240307-v1:0":
        foundationModel = "anthropic.claude-3-haiku-20240307-v1:0"

    paginator = ddb_client.get_paginator("scan")
    connectionIds = []

    api_gateway_management_api = boto3.client(
        "apigatewaymanagementapi",
        endpoint_url= "https://" + event["requestContext"]["domainName"] + "/" + event["requestContext"]["stage"]
    )

    # Extend connections
    for page in paginator.paginate(TableName=TABLE_NAME):
        connectionIds.extend(page["Items"])

    client = boto3.client('bedrock-agent')

    # Get Bedrock Agent
    agent = client.get_agent(agentId = AGENT_ID)
    
    logger.info(agent['agent'])

    # Update Bedrock
    response = client.update_agent(
        agentId = agent['agent'].get('agentId'),
        agentName = agent['agent'].get('agentName'),
        agentResourceRoleArn = agent['agent'].get('agentResourceRoleArn'),
        instruction = agent['agent'].get('instruction'),
        foundationModel = foundationModel,
        #promptOverrideConfiguration = agent['agent'].get('promptOverrideConfiguration')
    )
    logger.info(response)

    # Prepare agent
    response = client.prepare_agent(
        agentId = AGENT_ID,
    )
    logger.info(response)


    # Send message to all connected clients
    for connectionId in connectionIds:
        try:
            logger.info("Sending message to connectionId: " + connectionId["connectionId"]["S"])

            api_gateway_management_api.post_to_connection(
                ConnectionId=connectionId["connectionId"]["S"],
                Data=json.dumps({"message": "updated agent", "agentId": AGENT_ID, "foundationModel": foundationModel}),
            )
        except Exception as e:
             logger.error(f"Error sending message to connectionId {connectionId}: {e}")

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
        },
        "body": json.dumps({"message": "updated agent", "agentId": AGENT_ID, "foundationModel": foundationModel}),
    }
