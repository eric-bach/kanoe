import { Stack, StackProps } from 'aws-cdk-lib';
import { MockIntegration, PassthroughBehavior, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

interface AxelaApiStackProps extends StackProps {
  appName: string;
  envName: string;
}

export class AxelaApiStack extends Stack {
  constructor(scope: Construct, id: string, props: AxelaApiStackProps) {
    super(scope, id, props);

    /**********
      Mock APIs
     **********/

    const restapi = new RestApi(this, 'RestApi');

    restapi.root.addMethod(
      'ANY',
      new MockIntegration({
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.body.response_id': 'integration.response.header.response_id', // The mapping
            },
          },
        ],
        passthroughBehavior: PassthroughBehavior.NEVER,
        requestTemplates: {
          'application/json': '{ "statusCode": 200 }',
        },
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.body.response_id': true, // Required to map a value to this
            },
          },
        ],
        //authorizer,
      }
    );
  }
}
