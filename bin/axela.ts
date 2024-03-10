#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AxelaStack } from '../lib/axela-stack';

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

new AxelaStack(app, `${appName}-agents-${envName}`, { ...baseProps, appName, envName });
