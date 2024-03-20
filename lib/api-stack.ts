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

    const getMemberMockIntegration = new MockIntegration({
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

    const getMember = restapi.root.addResource('member').addResource('{memberNumber}');

    getMember.addMethod('GET', getMemberMockIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': Model.EMPTY_MODEL,
          },
        },
      ],
    });

    // GET /rewards/balance/{memberId}

    const getRewardDollarBalanceMockIntegration = new MockIntegration({
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
      integrationResponses: [
        {
          statusCode: '200',
          responseTemplates: {
            'application/json': '{"memberId": 2175107, "balance": 153.87}',
          },
        },
      ],
    });

    const getRewardDollarBalance = restapi.root.addResource('rewards').addResource('balance').addResource('{memberId}');

    getRewardDollarBalance.addMethod('GET', getRewardDollarBalanceMockIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': Model.EMPTY_MODEL,
          },
        },
      ],
    });

    // GET /airport/{city}

    const getAirportCodeMockIntegration = new MockIntegration({
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
      integrationResponses: [
        {
          statusCode: '200',
          responseTemplates: {
            'application/json': '{"id": "CDG"}',
          },
        },
      ],
    });

    const getAirportCode = restapi.root.addResource('airport').addResource('{city}');

    getAirportCode.addMethod('GET', getAirportCodeMockIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': Model.EMPTY_MODEL,
          },
        },
      ],
    });

    // GET /flights/{departureId}/{arrivalId}/{date}

    const getAvailableFlightsMockIntegration = new MockIntegration({
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
      integrationResponses: [
        {
          statusCode: '200',
          responseTemplates: {
            'application/json':
              '[{"id": "WS123", "airline": "WestJet", "departureid": "YYC", "departureTime": "2024-04-01T03:19:25:00Z", "arrivalId": "CDG", "arrivalTime": "2024-04-01T11:12:00Z", "price": 123.45}]',
          },
        },
      ],
    });

    const flightsResource = restapi.root.addResource('flights');
    const getAvailableFlights = flightsResource.addResource('{departureId}').addResource('{arrivalId}').addResource('{date}');

    getAvailableFlights.addMethod('GET', getAvailableFlightsMockIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': Model.EMPTY_MODEL,
          },
        },
      ],
    });

    // POST /flights/bookings/{id}

    const bookFlightMockIntegration = new MockIntegration({
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
      integrationResponses: [
        {
          statusCode: '200',
          responseTemplates: {
            'application/json': '{"memberId": "123456", "flightId": "WS10", "bookingId": "ABC123"}',
          },
        },
      ],
    });

    const bookFlight = flightsResource.addResource('bookings').addResource('{id}');

    bookFlight.addMethod('POST', bookFlightMockIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': Model.EMPTY_MODEL,
          },
        },
      ],
    });

    /**********
     Outputs
     **********/

    new CfnOutput(this, 'ApiGatewayUrl', { value: restapi.url });

    this.restApiUrl = restapi.url;
  }
}
