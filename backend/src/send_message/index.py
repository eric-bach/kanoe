import os
import boto3
import json
import uuid
from aws_lambda_powertools import Logger

TABLE_NAME = os.environ["TABLE_NAME"]
AGENT_ID = os.environ["AGENT_ID"]
AGENT_ALIAS_ID = os.environ["AGENT_ALIAS_ID"]

ddb_client = boto3.client("dynamodb")
ddb = boto3.resource("dynamodb")
table = ddb.Table(TABLE_NAME)

logger = Logger()

@logger.inject_lambda_context(log_event=True)
def handler(event, context):
    event_body = json.loads(event["body"])
    prompt = event_body["prompt"]
    conversation = event_body["conversation"]

    print("Conversation", conversation)
    print("Conversation Messages", conversation["messages"])
    if not conversation["messages"]:
        conversation["messages"] = [{'type': 'human', 'content': prompt}]
    else:
        conversation["messages"].append({'type': 'human', 'content': prompt})
    print("Conversation", conversation)

    paginator = ddb_client.get_paginator("scan")
    connectionIds = []

    api_gateway_management_api = boto3.client(
        "apigatewaymanagementapi",
        endpoint_url= "https://" + event["requestContext"]["domainName"] + "/" + event["requestContext"]["stage"]
    )

    # Extend connections
    for page in paginator.paginate(TableName=TABLE_NAME):
        connectionIds.extend(page["Items"])

    # Invoke Bedrock
    client = boto3.client("bedrock-agent-runtime")
    response = client.invoke_agent(
        inputText=prompt,
        agentId=AGENT_ID,
        agentAliasId=AGENT_ALIAS_ID,
        sessionId=str(uuid.uuid1()),
        enableTrace=True
    )
    logger.info(response)

    event_stream = response['completion']
    try:
        for event in event_stream:
            print("Event", event)    
            if 'chunk' in event:
                data = event['chunk']['bytes']
                logger.info(f"Final answer ->\n{data.decode('utf8')}") 
                agent_answer = data.decode('utf8')
                end_event_received = True
                # End event indicates that the request finished successfully
            elif 'trace' in event:
                print("🔔 Trace", json.dumps(event['trace']))
                
                if not conversation["traces"]:
                    conversation["traces"] = [event['trace']]
                else:
                    conversation["traces"].append(event['trace'])

                logger.info(json.dumps(event['trace'], indent=2))
            else:
                raise Exception("unexpected event.", event)
    except Exception as e:
        #print("Exception", e)
        raise Exception("unexpected event.", e)

    print("🚀 Final Trace", conversation["traces"])

    # Send message to all connected clients
    print("Conversation Final", conversation)
    for connectionId in connectionIds:
        try:
            logger.info("Sending message to connectionId: " + connectionId["connectionId"]["S"])
            print("Message", agent_answer)

            api_gateway_management_api.post_to_connection(
                ConnectionId=connectionId["connectionId"]["S"],
                Data=json.dumps({"messages": conversation, "prompt": agent_answer})
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
        "body": json.dumps({"message": agent_answer}),
    }
