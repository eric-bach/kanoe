import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
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

const dotenv = require('dotenv');
dotenv.config();

interface TravelAgentStackProps extends StackProps {
  appName: string;
  envName: string;
  restApiUrl: string;
}

export class TravelAgentStack extends Stack {
  constructor(scope: Construct, id: string, props: TravelAgentStackProps) {
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
        fromName: 'Travel Agent',
        sesRegion: this.region,
      }),
      userVerification: {
        emailSubject: 'Travel Agent - Verify your new account',
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
      agentName: 'TravelAgent',
      instruction:
        'You are an agent that helps members search for a flight. Members with a saved credit card and/or reward dollars can use it \
        to pay for part of all of the flight so ensure you retrieve member and reward dollar balances with their membership number \
        or member ID. If they did not specify a departure city, ask if they are departing from same the city you retrieved from the \
        member information. Once you confirm, check for available flights matching the destination city. For each flight available, \
        let the member know the flight ID, airline, departure and arrival date/time, and price. If the member would like to book the \
        flight, use the previously saved credit card to book the flight for the member. If reward dollars were used to pay for any \
        of the flight, let them know the remaining cost of the flight if they were applied, and how many reward dollars would remain \
        if they applied them.',
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

    const agent = new BedrockAgent(this, 'BedrockAgent', bedrockAgentProps);

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

    // TODO Change this each time agent is created
    const AGENT_ID = 'Y0C25OEQR3'; //UANIRJK8QF
    const sendMessage = new PythonFunction(this, 'SendMessage', {
      functionName: `${props.appName}-SendMessage-${props.envName}`,
      entry: 'src/send_message',
      runtime: Runtime.PYTHON_3_10,
      architecture: Architecture.ARM_64,
      memorySize: 2048,
      timeout: Duration.seconds(60),
      environment: {
        TABLE_NAME: table.tableName,
        AGENT_ID: AGENT_ID,
        AGENT_ALIAS_ID: 'TSTALIASID',
      },
      retryAttempts: 0,
      layers: [powertoolsLayer],
    });
    table.grantReadData(sendMessage);
    sendMessage.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeAgent'],
        resources: [`arn:aws:bedrock:*:*:agent-alias/${AGENT_ID}/TSTALIASID`],
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

    //**********
    // Frontend
    //**********

    const cloudfrontOAI = new OriginAccessIdentity(this, 'CloudFrontOAI', {
      comment: `OAI for Travel Agent CloudFront`,
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
              aliases: ['flights.ericbach.dev'],
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
        recordName: 'flights.ericbach.dev',
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

    new CfnOutput(this, 'CloudFrontDistributionName', {
      value: distribution.distributionDomainName,
    });
  }
}
