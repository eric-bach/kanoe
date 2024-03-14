#### TODOs

- Figure out how to create second Agent Group with IaC
  https://github.com/awslabs/generative-ai-cdk-constructs
  https://github.com/aws-samples/agentsforbedrock-retailagent/tree/main
  https://github.com/PieterjanCriel/bedrock-agents-cdk/blob/main/lib/agentStack.ts
- Create mock APIs to get fixed member info based on any member number
  - Member Action Group
    - GET /member/{memberNumber}
    - GET /rewards/balance/{memberId}
  - Travel Action Group
    - GET /trips/{locationName}
    - GET /bookings/{memberId}
    - POST /bookings
- Integrate mock API in chat
- Add mock APIs to get reward dollar balances/transactions

#### Reference

- [Bedrock Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [ReInvent Video](https://www.youtube.com/watch?v=JNZPW82uv7w&list=WL&index=13&t=2172s)

### IaC for Bedrock

https://github.com/PieterjanCriel/bedrock-agents-cdk/blob/main/lib/agentStack.ts
https://github.com/aws-samples/agentsforbedrock-retailagent/tree/main
https://github.com/awslabs/generative-ai-cdk-constructs

#### Other References

- Example using Amazon Generative AI Constructs
  https://github.com/leegilmorecode/serverless-amazon-bedrock-agents/tree/main
- Amazon Bedrock Generative AI Constructs announcement
  https://aws.amazon.com/events/?sc_icampaign=aware_aws-events&sc_ichannel=ha&sc_icontent=awssm-2021_event&sc_iplace=blog-sidebar&trk=ha_awssm-2021_event
- [AWS Generative AI CDK Constructs](https://github.com/awslabs/generative-ai-cdk-constructs)

- Amazon Bedrock Agents and Knowledge Bases example
  https://blog.serverlessadvocate.com/amazon-bedrock-knowledge-bases-with-private-data-7685d04ef396
  https://github.com/leegilmorecode/serverless-amazon-bedrock-agents/tree/main

- Example of follow up prompt (using Lex instead of Bedrock Agents)
  https://aws.amazon.com/blogs/machine-learning/build-generative-ai-agents-with-amazon-bedrock-amazon-dynamodb-amazon-kendra-amazon-lex-and-langchain/
