import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { MockIntegration, Model, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

interface AxelaApiStackProps extends StackProps {
  appName: string;
  envName: string;
}

export class AxelaApiStack extends Stack {
  public restApiUrl: string;

  constructor(scope: Construct, id: string, props: AxelaApiStackProps) {
    super(scope, id, props);

    /**********
      Mock APIs
     **********/

    const restapi = new RestApi(this, 'RestApi');

    // GET /member/{memberNumber}

    const mockIntegration = new MockIntegration({
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
      integrationResponses: [
        {
          statusCode: '200',
          responseTemplates: {
            'application/json':
              '{"id": 2175107, "firstName": "Eric", "lastName": "Bach", "addressLine1": "123 Main St", "addressLine2": "Apt 101", "city": "Anytown", "province": "AB", "postalCode": "T5T5T5"}',
          },
        },
      ],
    });

    const resource = restapi.root.addResource('member').addResource('{memberNumber}');

    resource.addMethod('GET', mockIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': Model.EMPTY_MODEL,
          },
        },
      ],
    });

    new CfnOutput(this, 'ApiGatewayUrl', { value: restapi.url });

    this.restApiUrl = restapi.url;
  }
}
