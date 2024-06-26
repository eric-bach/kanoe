import { CfnOutput, RemovalPolicy, Stack, StackProps, aws_kms } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { LambdaPowertoolsLayer } from 'cdk-aws-lambda-powertools-layer';
import { CanonicalUserPrincipal, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, ServerSideEncryption, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { BlockPublicAccess, Bucket, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { BedrockAgent, BedrockAgentProps } from './constructs/bedrock';
import { AccountRecovery, UserPool, UserPoolClient, UserPoolDomain, UserPoolEmail, VerificationEmailStyle } from 'aws-cdk-lib/aws-cognito';
import {
  CloudFrontAllowedMethods,
  CloudFrontWebDistribution,
  GeoRestriction,
  OriginAccessIdentity,
  PriceClass,
  SSLMethod,
  SecurityPolicyProtocol,
  ViewerCertificate,
} from 'aws-cdk-lib/aws-cloudfront';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { CacheControl } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import * as path from 'path';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import { Topic } from '@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock';
import { Key } from 'aws-cdk-lib/aws-kms';

const dotenv = require('dotenv');
dotenv.config();

interface KanoeStackProps extends StackProps {
  appName: string;
  envName: string;
  restApiUrl: string;
}

export class KanoeStack extends Stack {
  constructor(scope: Construct, id: string, props: KanoeStackProps) {
    super(scope, id, props);

    /**********
     * Auth
     **********/

    const userPool = new UserPool(this, 'UserPool', {
      userPoolName: `${props.appName}_user_pool_${props.envName}`,
      selfSignUpEnabled: true,
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      autoVerify: {
        email: true,
      },
      email: UserPoolEmail.withSES({
        // @ts-ignore
        fromEmail: process.env.SENDER_EMAIL,
        fromName: 'Kanoe',
        sesRegion: this.region,
      }),
      userVerification: {
        emailSubject: 'Kanoe - Verify your new account',
        emailBody: 'Thanks for signing up! Please enter the verification code {####} to confirm your account.',
        emailStyle: VerificationEmailStyle.CODE,
      },
      signInAliases: {
        username: false,
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new UserPoolDomain(this, `UserPoolDomain`, {
      userPool: userPool,
      cognitoDomain: {
        domainPrefix: `${props.appName}-${props.envName}`,
      },
    });

    const userPoolClient = new UserPoolClient(this, 'UserPoolWebClient', {
      userPoolClientName: `${props.appName}_user_client`,
      accessTokenValidity: Duration.hours(4),
      idTokenValidity: Duration.hours(4),
      userPool,
    });

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

    const table = new Table(this, 'WebsocketConnections', {
      tableName: `${props.appName}-connections-${props.envName}`,
      partitionKey: { name: 'connectionId', type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
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

    // Method 2: AWS Samples Generative AI Constructs - https://github.com/awslabs/generative-ai-cdk-constructs

    // NOTE: This will cost $700/month to spin up OpenSearch Service
    // const kb = new bedrock.KnowledgeBase(this, 'KnowledgeBase', {
    //   embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
    //   instruction: 'Search for the latitude and longitude of the city provided in the prompt',
    // });

    // Guardrails
    const guardrails = new bedrock.Guardrail(this, 'BedrockGuardrails', {
      name: 'KanoeGuardrails',
      description: 'Guardrails for Kanoe Agent',
      blockedInputMessaging: "That is a good question, but I am unable to answer that. Let's try something else.",
      blockedOutputsMessaging: "I'm sorry, I am unable to provide that information. Let's try something else.",
    });

    //  Add Denied topics
    const topic = new Topic(this, 'topic');
    // topic.financialAdviceTopic();
    // topic.politicalAdviceTopic();
    // topic.medicalAdvice();
    // topic.inappropriateContent();
    // topic.legalAdvice();
    topic.createTopic({
      name: 'Politics',
      definition: 'Statements or questions about politics or politicians',
      examples: ['What is the political situation in that country?'],
      type: 'DENY',
    });
    guardrails.addTopicPolicyConfig(topic);

    // Add Word filters
    guardrails.addWordPolicyConfig([
      {
        text: 'kayak',
      },
      {
        text: 'costco',
      },
      {
        text: 'expedia',
      },
      {
        text: 'travelocity',
      },
    ]);

    const kmsKey = Key.fromKeyArn(this, 'KMSKey', guardrails.kmsKeyArn);

    const agent = new bedrock.Agent(this, 'BedrockAgent', {
      name: 'KanoeAgent',
      foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_SONNET_V1_0,
      instruction:
        'You are an agent that helps members search for a flight. Before doing anything, look up the members information using \
        their 16-digit membership number. Members with a saved credit card and/or reward dollars can use it \
        to pay for part of all of the flight if they decide to use it. Let the member know the options for each available \
        flight including the flight ID, airline, departure and arrival date/time, and price. If the member would like to book the \
        flight, confirm if they would like to use the saved credit card to book the flight for the member and if they would like to \
        use any of their available reward dollars to pay for any of the flkight. Then let them know the remaining cost of the flight \
        if they were applied, and how many reward dollars would remain.',
      idleSessionTTL: Duration.minutes(30),
      // knowledgeBases: [kb],
      shouldPrepareAgent: true,
      encryptionKey: kmsKey,
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
    agent.role?.addToPolicy(
      new PolicyStatement({
        actions: ['kms:*'],
        resources: [kmsKey.keyArn],
      })
    );
    const memberAgentGroup = new bedrock.AgentActionGroup(this, 'MemberAgentGroup', {
      actionGroupName: 'MemberActionGroup',
      actionGroupExecutor: { lambda: memberAgentFunction },
      actionGroupState: 'ENABLED',
      apiSchema: bedrock.S3ApiSchema.fromBucket(bucket, 'member_service.json'),
    });
    agent.addActionGroup(memberAgentGroup);

    const rewardsAgentGroup = new bedrock.AgentActionGroup(this, 'RewardsAgentGroup', {
      actionGroupName: 'RewardsAgentGroup',
      actionGroupExecutor: { lambda: rewardsAgentFunction },
      actionGroupState: 'ENABLED',
      apiSchema: bedrock.S3ApiSchema.fromBucket(bucket, 'rewards_service.json'),
    });
    agent.addActionGroup(rewardsAgentGroup);

    const travelAgentGroup = new bedrock.AgentActionGroup(this, 'TravelAgentGroup', {
      actionGroupName: 'TravelAgentGroup',
      actionGroupExecutor: { lambda: travelAgentFunction },
      actionGroupState: 'ENABLED',
      apiSchema: bedrock.S3ApiSchema.fromBucket(bucket, 'travel_service.json'),
    });
    agent.addActionGroup(travelAgentGroup);

    // Ensure bucket deployment completes before agent action group so the files are available
    memberAgentGroup.node.addDependency(bucketDeployment);
    rewardsAgentGroup.node.addDependency(bucketDeployment);
    travelAgentGroup.node.addDependency(bucketDeployment);

    // Grant Bedrock Agent permissions to invoke the Lambda function
    memberAgentFunction.addPermission('InvokeFunction', {
      principal: new ServicePrincipal('bedrock.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: agent.agentArn,
    });
    rewardsAgentFunction.addPermission('InvokeFunction', {
      principal: new ServicePrincipal('bedrock.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: agent.agentArn,
    });
    travelAgentFunction.addPermission('InvokeFunction', {
      principal: new ServicePrincipal('bedrock.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: agent.agentArn,
    });

    /**********
      Websocket Functions
     **********/

    const connectWebsocket = new PythonFunction(this, 'ConnectWebsocket', {
      functionName: `${props.appName}-ConnectWebsocket-${props.envName}`,
      entry: 'src/connect_websocket',
      runtime: Runtime.PYTHON_3_10,
      architecture: Architecture.ARM_64,
      memorySize: 384,
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
      },
      retryAttempts: 0,
      layers: [powertoolsLayer],
    });
    table.grantReadWriteData(connectWebsocket);

    const disconnectWebsocket = new PythonFunction(this, 'DisconnectWebsocket', {
      functionName: `${props.appName}-DisconnectWebsocket-${props.envName}`,
      entry: 'src/disconnect_websocket',
      runtime: Runtime.PYTHON_3_10,
      architecture: Architecture.ARM_64,
      memorySize: 384,
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
      },
      retryAttempts: 0,
      layers: [powertoolsLayer],
    });
    table.grantReadWriteData(disconnectWebsocket);

    const authWebsocket = new PythonFunction(this, 'AuthWebsocket', {
      functionName: `${props.appName}-AuthWebsocket-${props.envName}`,
      entry: 'src/auth_websocket',
      runtime: Runtime.PYTHON_3_10,
      architecture: Architecture.ARM_64,
      memorySize: 384,
      timeout: Duration.seconds(30),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        APP_CLIENT_ID: userPoolClient.userPoolClientId,
      },
      retryAttempts: 0,
      layers: [powertoolsLayer],
    });

    const sendMessage = new PythonFunction(this, 'SendMessage', {
      functionName: `${props.appName}-SendMessage-${props.envName}`,
      entry: 'src/send_message',
      runtime: Runtime.PYTHON_3_10,
      architecture: Architecture.ARM_64,
      memorySize: 3072,
      timeout: Duration.seconds(120),
      environment: {
        TABLE_NAME: table.tableName,
        AGENT_ID: agent.agentId,
        AGENT_ALIAS_ID: 'TSTALIASID',
      },
      retryAttempts: 0,
      layers: [powertoolsLayer],
    });
    table.grantReadData(sendMessage);
    sendMessage.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeAgent'],
        resources: [`arn:aws:bedrock:*:*:agent-alias/${agent.agentId}/TSTALIASID`],
      })
    );
    sendMessage.addToRolePolicy(
      new PolicyStatement({
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: [kmsKey.keyArn],
      })
    );

    const setAgent = new PythonFunction(this, 'SetAgent', {
      functionName: `${props.appName}-SetAgent-${props.envName}`,
      entry: 'src/set_agent',
      runtime: Runtime.PYTHON_3_10,
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        AGENT_ID: agent.agentId,
      },
      retryAttempts: 0,
      layers: [powertoolsLayer],
    });
    table.grantReadData(setAgent);
    setAgent.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:GetAgent', 'bedrock:UpdateAgent', 'bedrock:PrepareAgent'],
        resources: [`arn:aws:bedrock:*:*:agent/${agent.agentId}`],
      })
    );
    setAgent.addToRolePolicy(
      new PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [agent.role!.roleArn],
      })
    );

    //**********
    // APIs
    //**********

    // Websocket API
    const webSocketApi = new WebSocketApi(this, 'GenerateResponseWebsocket', {
      apiName: `${props.appName}-websocket-api-${props.envName}`,
      connectRouteOptions: {
        authorizer: new WebSocketLambdaAuthorizer('Authorizer', authWebsocket, {
          identitySource: ['route.request.querystring.idToken'],
        }),
        integration: new WebSocketLambdaIntegration('ConnectHandlerIntegration', connectWebsocket),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectHandlerIntegration', disconnectWebsocket),
      },
      routeSelectionExpression: '$request.body.action',
    });
    const apiStage = new WebSocketStage(this, 'WebsocketStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });
    webSocketApi.addRoute('SendMessage', {
      integration: new WebSocketLambdaIntegration('SendMessageIntegration', sendMessage),
    });
    webSocketApi.addRoute('SetAgent', {
      integration: new WebSocketLambdaIntegration('SetAgentIntegration', setAgent),
    });

    // Add permissions to websocket function to manage websocket connections
    sendMessage.addToRolePolicy(
      new PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          this.formatArn({
            service: 'execute-api',
            resourceName: `${apiStage.stageName}/POST/*`,
            resource: webSocketApi.apiId,
          }),
        ],
      })
    );
    setAgent.addToRolePolicy(
      new PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          this.formatArn({
            service: 'execute-api',
            resourceName: `${apiStage.stageName}/POST/*`,
            resource: webSocketApi.apiId,
          }),
        ],
      })
    );

    //**********
    // Frontend
    //**********

    const cloudfrontOAI = new OriginAccessIdentity(this, 'CloudFrontOAI', {
      comment: `OAI for Kanoe Agent CloudFront`,
    });

    const websiteBucket = new Bucket(this, 'WebsiteBucket', {
      bucketName: `${props.appName}-website-${props.envName}`,
      websiteIndexDocument: 'index.html',
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      cors: [
        {
          allowedHeaders: ['Authorization', 'Content-Length'],
          allowedMethods: [HttpMethods.GET],
          allowedOrigins: ['*'],
          maxAge: 3000,
        },
      ],
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    websiteBucket.addToResourcePolicy(
      new PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [websiteBucket.arnForObjects('*')],
        principals: [new CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
      })
    );

    // @ts-ignore
    // Existing ACM certificate
    const certificate = Certificate.fromCertificateArn(this, 'Certificate', process.env.CERTIFICATE_ARN);

    const distribution = new CloudFrontWebDistribution(this, 'CloudFrontDistribution', {
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultRootObject: 'container/latest/index.html',
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: websiteBucket,
            originAccessIdentity: cloudfrontOAI,
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              defaultTtl: Duration.hours(1),
              minTtl: Duration.seconds(0),
              maxTtl: Duration.days(1),
              compress: true,
              allowedMethods: CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
            },
          ],
        },
      ],
      geoRestriction: GeoRestriction.allowlist('CA'),
      errorConfigurations: [
        {
          errorCode: 403,
          errorCachingMinTtl: 60,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
      ],
      viewerCertificate:
        props.envName === 'prod'
          ? ViewerCertificate.fromAcmCertificate(certificate, {
              aliases: ['kanoe.ericbach.dev'],
              securityPolicy: SecurityPolicyProtocol.TLS_V1_2_2021,
              sslMethod: SSLMethod.SNI,
            })
          : undefined,
    });

    if (props.envName === 'prod') {
      // Route53 HostedZone A record
      var existingHostedZone = HostedZone.fromLookup(this, 'Zone', {
        domainName: 'ericbach.dev',
      });
      new ARecord(this, 'AliasRecord', {
        zone: existingHostedZone,
        recordName: 'kanoe.ericbach.dev',
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      });
    }

    new BucketDeployment(this, 'WebsiteBucketDeployment', {
      sources: [Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: websiteBucket,
      retainOnDelete: false,
      contentLanguage: 'en',
      //storageClass: StorageClass.INTELLIGENT_TIERING,
      serverSideEncryption: ServerSideEncryption.AES_256,
      cacheControl: [CacheControl.setPublic(), CacheControl.maxAge(Duration.minutes(1))],
      distribution,
      distributionPaths: ['/static/css/*'],
    });

    // /**********
    //  * Outputs
    //  **********/

    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });

    new CfnOutput(this, 'WebsocketUrl', {
      value: webSocketApi.apiEndpoint,
    });

    new CfnOutput(this, 'CloudFrontDistributionName', {
      value: distribution.distributionDomainName,
    });
  }
}
