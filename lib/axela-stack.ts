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
}

export class AxelaStack extends Stack {
  constructor(scope: Construct, id: string, props: AxelaStackProps) {
    super(scope, id, props);

    /**********
     Bucket
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

    const agentFunction = new PythonFunction(this, 'BedrockAgentFunction', {
      functionName: `${props.appName}-retail-${props.envName}`,
      entry: 'src/bedrock_agent',
      runtime: Runtime.PYTHON_3_10,
      architecture: Architecture.ARM_64,
      memorySize: 384,
      timeout: Duration.seconds(30),
      retryAttempts: 0,
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
      layers: [powertoolsLayer],
    });
    agentFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:*'],
        resources: ['*'],
      })
    );

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
        //'You are an agent that helps customers purchase shoes. Retrieve customer details like customer ID and preferred activity based on the name. Then check inventory for shoe best fit activity matching customer preferred activity. Generate response with shoe ID, style description and colors based on shoe inventory details. If multiple matches exist, display all of them to the user. After customer indicates they would like to order the shoe, use the shoe ID corresponding to their choice and customer ID from initial customer details retrieved, to place order for the shoe.',
        "You are an agent that helps members purchase and book a trip. Retrieve members details like member ID based on their membership number. Then check inventory for trip activity types matching member's preferred trip types. Generate response with trip ID, trip description and price based on trip inventory details. If multiple matches exist, display all of them to the user. After member indicates they would like to book the trip, use the trip ID corresponding to their choice and member ID from initial membership details retrieved, to place booking for the trip.",
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

    const actionGroup = new bedrock.AgentActionGroup(this, 'AgentActionGroup', {
      actionGroupName: 'RetailAgentGroup',
      agent,
      apiSchema: bedrock.S3ApiSchema.fromBucket(bucket, 'customerservicebot.json'),
      actionGroupState: 'ENABLED',
      actionGroupExecutor: agentFunction,
      shouldPrepareAgent: true,
    });
    // Ensure bucket deployment completest before agent action group so the files are available
    actionGroup.node.addDependency(bucketDeployment);

    // Grant Bedrock Agent permissions to invoke the Lambda function
    agentFunction.addPermission('InvokeFunction', {
      principal: new ServicePrincipal('bedrock.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: agent.agentArn,
    });
  }
}
