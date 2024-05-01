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
    
    # Initialize conversation
    currentSessionId = conversation.get('sessionId')
    if not currentSessionId:
        currentSessionId = str(uuid.uuid4())

    print("Received conversation:", conversation)
    if not conversation["messages"]:
        conversation["messages"] = [{'type': 'human', 'content': prompt, 'debug': {}}]
    else:
        conversation["messages"].append({'type': 'human', 'content': prompt, 'debug': {}})
    print("Initialized conversation:", conversation)

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
        sessionId=currentSessionId,
        enableTrace=True
    )
    logger.info(response)

    event_stream = response['completion']
    try:
        debug_event = []
        for event in event_stream:
            print("Event", event)

            if 'trace' in event:
                #print("🟡 Full Trace", json.dumps(event['trace']))
                trace = event['trace']['trace']
                sessionId = event['trace']['sessionId']
                phase = 'preProcessingTrace'
                if 'orchestrationTrace' in trace:
                    phase = 'orchestrationTrace'
                elif 'postProcessingTrace' in trace:
                    phase = 'postProcessingTrace'

                print("👉 Session", sessionId)
                print("👉 Phase", phase)
                print("👉 Trace", json.dumps(trace))

                # Reduce payload size
                # if phase is 'preProcessingTrace' and 'inferenceConfiguration' in trace['preProcessingTrace']['modelInvocationInput']:
                #     continue
                # if phase != 'orchestrationTrace':
                #     continue

                if not debug_event:
                    debug_event = [trace]
                else:
                    debug_event.append(trace)

                logger.info(trace)

            elif 'chunk' in event:
                data = event['chunk']['bytes']
                logger.info(f"🟢 Final answer ->\n{data.decode('utf8')}") 
                agent_answer = data.decode('utf8')
                end_event_received = True
                # End event indicates that the request finished successfully

            else:
                raise Exception("Unexpected event", event)
    except Exception as e:
        raise Exception("Unexpected event", e)

    convo = {'content': agent_answer, 'type': 'agent', 'debug': debug_event}
    conversation["messages"].append(convo)
    print("🚀 Conversation", convo)

    # Send message to all connected clients
    print("Conversation Final", conversation)
    for connectionId in connectionIds:
        try:
            logger.info("Sending message to connectionId: " + connectionId["connectionId"]["S"])

            api_gateway_management_api.post_to_connection(
                ConnectionId=connectionId["connectionId"]["S"],
                Data=json.dumps({"messages": conversation["messages"], 'sessionId': sessionId})
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
