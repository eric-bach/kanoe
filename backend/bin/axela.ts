#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AxelaStack } from '../lib/axela-stack';
import { AxelaApiStack } from '../lib/api-stack';

const app = new cdk.App();

const appName = app.node.tryGetContext('appName');
const envName = app.node.tryGetContext('envName');

const baseProps: cdk.StackProps = {
  env: {
    region: 'us-east-1',
  },
  tags: {
    environment: envName,
    application: appName,
  },
};

const api = new AxelaApiStack(app, `${appName}-api-${envName}`, { ...baseProps, appName, envName });

new AxelaStack(app, `${appName}-agents-${envName}`, { ...baseProps, appName, envName, restApiUrl: api.restApiUrl });
