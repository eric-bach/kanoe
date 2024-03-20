import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { LambdaPowertoolsLayer } from 'cdk-aws-lambda-powertools-layer';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import * as path from 'path';

interface AxelaStackProps extends StackProps {
  appName: string;
  envName: string;
  restApiUrl: string;
}

export class AxelaStack extends Stack {
  constructor(scope: Construct, id: string, props: AxelaStackProps) {
    super(scope, id, props);

    /**********
     Storage
     **********/

    const bucket = new Bucket(this, 'ResourcesBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const bucketDeployment = new BucketDeployment(this, 'DeployResources', {
      sources: [Source.asset(path.join(__dirname, '../data'))],
      destinationBucket: bucket,
      retainOnDelete: false,
    });

    /**********
     Lambda Functions
     **********/

    // Lambda Powertools Layer
    const powertoolsLayer = new LambdaPowertoolsLayer(this, 'PowertoolsLayer', {
      version: '2.32.0',
      includeExtras: true,
    });

    const memberAgentFunction = new PythonFunction(this, 'MemberAgentFunction', {
      functionName: `${props.appName}-member-${props.envName}`,
      entry: 'src/member_agent',
      runtime: Runtime.PYTHON_3_10,
      architecture: Architecture.ARM_64,
      memorySize: 384,
      timeout: Duration.seconds(30),
      retryAttempts: 0,
      environment: {
        API_GATEWAY_URL: props.restApiUrl,
      },
      layers: [powertoolsLayer],
    });

    const travelAgentFunction = new PythonFunction(this, 'TravelAgentFunction', {
      functionName: `${props.appName}-travel-${props.envName}`,
      entry: 'src/travel_agent',
      runtime: Runtime.PYTHON_3_10,
      architecture: Architecture.ARM_64,
      memorySize: 384,
      timeout: Duration.seconds(30),
      retryAttempts: 0,
      environment: {
        API_GATEWAY_URL: props.restApiUrl,
      },
      layers: [powertoolsLayer],
    });

    /**********
      Bedrock 
     **********/

    // NOTE: This will cost $700/month to spin up OpenSearch Service
    // const kb = new bedrock.KnowledgeBase(this, 'KnowledgeBase', {
    //   embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
    //   instruction: 'Search for the latitude and longitude of the city provided in the prompt',
    // });

    const agent = new bedrock.Agent(this, 'BedrockAgent', {
      name: 'RetailAgentCDK',
      foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_V2_1,
      instruction:
        'You are an agent that helps members purchase and book a flight. A membership is required to book flights so ensure you \
         retrieve members details like member ID, departure city from their address, AMA reward dollars balance \
         based on their membership number or member ID such that AMA reward dollars can be used to pay for part or all of a flight. \
         Address the user by their first and last name when you have to interact with them. \
         Then check for available flights matching the destination the member would like to travel to. Generate response with flight ID, \
         airline, time, and price based on flight availability details. If multiple flight options exist, display all of them to the user. \
         After member indicates they would like to book the flight, use the flight ID corresponding to their choice and member ID from \
         initial membership details retrieved, to place a booking for the flight. If they have available reward dollars ask if they would like \
         to apply those towards the flight price. When successfully book, let the member know their flight confirmation ID and remaining \
         reward dollars balance if any.',
      idleSessionTTL: Duration.minutes(30),
      // knowledgeBases: [kb],
      shouldPrepareAgent: true,
      // TODO: Investigate advanced prompt templates
      // promptOverrideConfiguration: {
      //   promptConfigurations: [
      //     {
      //       promptType: bedrock.PromptType.ORCHESTRATION,
      //       promptState: bedrock.PromptState.ENABLED,
      //       promptCreationMode: bedrock.PromptCreationMode.OVERRIDDEN,
      //       basePromptTemplate: orchestration,
      //       inferenceConfiguration: {
      //         temperature: 0.0,
      //         topP: 1,
      //         topK: 250,
      //         maximumLength: 2048,
      //         stopSequences: ['</invoke>', '</answer>', '</error>'],
      //       },
      //     },
      //   ],
      // },
    });
    agent.role?.addManagedPolicy({ managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess' });
    agent.role?.addManagedPolicy({ managedPolicyArn: 'arn:aws:iam::aws:policy/AWSLambda_FullAccess' });
    agent.role?.addToPolicy(
      new PolicyStatement({
        actions: ['bedrock:*'],
        resources: ['*'],
      })
    );

    const memberAgentGroup = new bedrock.AgentActionGroup(this, 'MemberAgentGroup', {
      actionGroupName: 'MemberAgentGroup',
      agent,
      apiSchema: bedrock.S3ApiSchema.fromBucket(bucket, 'member_service.json'),
      actionGroupState: 'ENABLED',
      actionGroupExecutor: memberAgentFunction,
      shouldPrepareAgent: true,
    });

    const travelAgentGroup = new bedrock.AgentActionGroup(this, 'TravelAgentGroup', {
      actionGroupName: 'TravelAgentGroup',
      agent,
      apiSchema: bedrock.S3ApiSchema.fromBucket(bucket, 'travel_service.json'),
      actionGroupState: 'ENABLED',
      actionGroupExecutor: travelAgentFunction,
      shouldPrepareAgent: true,
    });

    // Ensure bucket deployment completes before agent action group so the files are available
    memberAgentGroup.node.addDependency(bucketDeployment);
    travelAgentGroup.node.addDependency(bucketDeployment);

    // Grant Bedrock Agent permissions to invoke the Lambda function
    memberAgentFunction.addPermission('InvokeFunction', {
      principal: new ServicePrincipal('bedrock.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: agent.agentArn,
    });
    travelAgentFunction.addPermission('InvokeFunction', {
      principal: new ServicePrincipal('bedrock.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: agent.agentArn,
    });
  }
}
