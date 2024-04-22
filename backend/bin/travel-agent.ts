#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TravelAgentStack } from '../lib/travel-agent-stack';
import { ApiStack } from '../lib/api-stack';

const app = new cdk.App();

const appName = app.node.tryGetContext('appName');
const envName = app.node.tryGetContext('envName');

const baseProps: cdk.StackProps = {
  env: {
    region: 'us-east-1',
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  tags: {
    environment: envName,
    application: appName,
  },
};

const api = new ApiStack(app, `${appName}-api-${envName}`, { ...baseProps, appName, envName });

new TravelAgentStack(app, `${appName}-agents-${envName}`, { ...baseProps, appName, envName, restApiUrl: api.restApiUrl });
