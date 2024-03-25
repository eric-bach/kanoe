import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { LambdaPowertoolsLayer } from 'cdk-aws-lambda-powertools-layer';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import * as path from 'path';
import { BedrockAgent, BedrockAgentProps } from './constructs/bedrock';

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

    const rewardsAgentFunction = new PythonFunction(this, 'RewardsAgentFunction', {
      functionName: `${props.appName}-rewards-${props.envName}`,
      entry: 'src/rewards_agent',
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

    // Method 1: Custom Resources - https://github.com/PieterjanCriel/bedrock-agents-cdk
    const agentRole = new Role(this, 'AgentIamRole', {
      roleName: 'AmazonBedrockExecutionRoleForAgents_' + 'RetailAgent',
      assumedBy: new ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Agent role created by CDK.',
    });
    agentRole.addToPolicy(
      new PolicyStatement({
        actions: ['*'],
        resources: ['arn:aws:bedrock:*'],
      })
    );
    bucket.grantRead(agentRole);

    const bedrockAgentProps: BedrockAgentProps = {
      bedrockRegion: 'us-east-1',
      agentName: 'RetailAgentCDK',
      instruction:
        'You are an agent that helps members search for a flight. Members with available reward dollars can use them to pay \
          for part or all of the flight so ensure you retrieve member and reward dollar balances with their membership number or member ID. \
          Then, check to see if they have any available reward dollars and let them know their balance. \
          If they did not specify a departure city, ask if they are departing from same the city you retrieved from the member information. \
          Always address the member by their name. \
          Once you confirm, check for available flights matching the destination city. For each flight available, \
          let the member know the flight ID, airline, departure and arrival date/time, and price. \
          If the member would like to book the flight, use the flight ID and member ID to generate a URL link to our booking website \
          and send it to the member so they can finish booking and purchasing the flight. \
          If reward dollars are to be used to book the flight, let them know the remaining cost of the flight if they were applied, \
          and how many reward dollars would remain if they applied them.',
      foundationModel: 'anthropic.claude-v2:1',
      agentResourceRoleArn: agentRole.roleArn,
      idleSessionTTLInSeconds: 600,
      actionGroups: [
        {
          actionGroupName: 'MemberActionGroup',
          actionGroupExecutor: memberAgentFunction.functionArn,
          s3BucketName: bucket.bucketName,
          s3ObjectKey: 'member_service.json',
          description: 'Member Service Action Group',
        },
        {
          actionGroupName: 'RewardsActionGroup',
          actionGroupExecutor: rewardsAgentFunction.functionArn,
          s3BucketName: bucket.bucketName,
          s3ObjectKey: 'rewards_service.json',
          description: 'Rewards Service Action Group',
        },
        {
          actionGroupName: 'TravelActionGroup',
          actionGroupExecutor: travelAgentFunction.functionArn,
          s3BucketName: bucket.bucketName,
          s3ObjectKey: 'travel_service.json',
          description: 'Travel Service Action Group',
        },
      ],
    };

    new BedrockAgent(this, 'BedrockAgent', bedrockAgentProps);

    // Method 2: AWS Samples Generative AI Constructs - https://github.com/awslabs/generative-ai-cdk-constructs
    // // NOTE: This will cost $700/month to spin up OpenSearch Service
    // // const kb = new bedrock.KnowledgeBase(this, 'KnowledgeBase', {
    // //   embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
    // //   instruction: 'Search for the latitude and longitude of the city provided in the prompt',
    // // });

    // const agent = new bedrock.Agent(this, 'BedrockAgent', {
    //   name: 'RetailAgent',
    //   foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_V2_1,
    //   instruction:
    //     'You are an agent that helps members search for a flight. Members with available reward dollars can use them to pay \
    //     for part or all of the flight so ensure you retrieve member and reward dollar balances with their membership number or member ID. \
    //     Then, check to see if they have any available reward dollars and let them know their balance. \
    //     If they did not specify a departure city, ask if they are departing from same the city you retrieved from the member information. \
    //     Always address the member by their name. \
    //     Once you confirm, check for available flights matching the destination city. For each flight available, \
    //     let the member know the flight ID, airline, departure and arrival date/time, and price. \
    //     If the member would like to book the flight, use the flight ID and member ID to generate a URL link to our booking website \
    //     and send it to the member so they can finish booking and purchasing the flight. \
    //     If reward dollars are to be used to book the flight, let them know the remaining cost of the flight if they were applied, \
    //     and how many reward dollars would remain if they applied them.',
    //   idleSessionTTL: Duration.minutes(30),
    //   // knowledgeBases: [kb],
    //   shouldPrepareAgent: true,
    //   // TODO: Investigate advanced prompt templates
    //   // promptOverrideConfiguration: {
    //   //   promptConfigurations: [
    //   //     {
    //   //       promptType: bedrock.PromptType.ORCHESTRATION,
    //   //       promptState: bedrock.PromptState.ENABLED,
    //   //       promptCreationMode: bedrock.PromptCreationMode.OVERRIDDEN,
    //   //       basePromptTemplate: orchestration,
    //   //       inferenceConfiguration: {
    //   //         temperature: 0.0,
    //   //         topP: 1,
    //   //         topK: 250,
    //   //         maximumLength: 2048,
    //   //         stopSequences: ['</invoke>', '</answer>', '</error>'],
    //   //       },
    //   //     },
    //   //   ],
    //   // },
    // });
    // agent.role?.addManagedPolicy({ managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess' });
    // agent.role?.addManagedPolicy({ managedPolicyArn: 'arn:aws:iam::aws:policy/AWSLambda_FullAccess' });
    // agent.role?.addToPolicy(
    //   new PolicyStatement({
    //     actions: ['bedrock:*'],
    //     resources: ['*'],
    //   })
    // );

    // const memberAgentGroup = new bedrock.AgentActionGroup(this, 'MemberAgentGroup', {
    //   actionGroupName: 'MemberActionGroup',
    //   agent,
    //   apiSchema: bedrock.S3ApiSchema.fromBucket(bucket, 'member_service.json'),
    //   actionGroupState: 'ENABLED',
    //   actionGroupExecutor: memberAgentFunction,
    //   shouldPrepareAgent: true,
    // });

    // const rewardsAgentGroup = new bedrock.AgentActionGroup(this, 'RewardsAgentGroup', {
    //   actionGroupName: 'RewardsAgentGroup',
    //   agent,
    //   apiSchema: bedrock.S3ApiSchema.fromBucket(bucket, 'rewards_service.json'),
    //   actionGroupState: 'ENABLED',
    //   actionGroupExecutor: rewardsAgentFunction,
    //   shouldPrepareAgent: true,
    // });

    // const travelAgentGroup = new bedrock.AgentActionGroup(this, 'TravelAgentGroup', {
    //   actionGroupName: 'TravelAgentGroup',
    //   agent,
    //   apiSchema: bedrock.S3ApiSchema.fromBucket(bucket, 'travel_service.json'),
    //   actionGroupState: 'ENABLED',
    //   actionGroupExecutor: travelAgentFunction,
    //   shouldPrepareAgent: true,
    // });

    // // Ensure bucket deployment completes before agent action group so the files are available
    // memberAgentGroup.node.addDependency(bucketDeployment);
    // rewardsAgentGroup.node.addDependency(bucketDeployment);
    // travelAgentGroup.node.addDependency(bucketDeployment);

    // // Grant Bedrock Agent permissions to invoke the Lambda function
    // memberAgentFunction.addPermission('InvokeFunction', {
    //   principal: new ServicePrincipal('bedrock.amazonaws.com'),
    //   action: 'lambda:InvokeFunction',
    //   sourceArn: agent.agentArn,
    // });
    // rewardsAgentFunction.addPermission('InvokeFunction', {
    //   principal: new ServicePrincipal('bedrock.amazonaws.com'),
    //   action: 'lambda:InvokeFunction',
    //   sourceArn: agent.agentArn,
    // });
    // travelAgentFunction.addPermission('InvokeFunction', {
    //   principal: new ServicePrincipal('bedrock.amazonaws.com'),
    //   action: 'lambda:InvokeFunction',
    //   sourceArn: agent.agentArn,
    // });
  }
}
