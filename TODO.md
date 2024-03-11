#### TODOs

- Create mock APIs to get fixed member info based on any member number
  GET /customer/{id}
- Integrate mock API in chat
- Add mock APIs to get reward dollar balances/transactions

#### Reference

- [Bedrock Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [ReInvent Video](https://www.youtube.com/watch?v=JNZPW82uv7w&list=WL&index=13&t=2172s)
- [Example of Bedrock Agent chat built with CFN](https://github.com/aws-samples/agentsforbedrock-retailagent/tree/main)
- [AWS Generative AI CDK Constructs](https://github.com/awslabs/generative-ai-cdk-constructs)
  - Have to manually enable 'User Input'

#### Other References

- Example of follow up prompt (using Lex instead of Bedrock Agents)
  https://aws.amazon.com/blogs/machine-learning/build-generative-ai-agents-with-amazon-bedrock-amazon-dynamodb-amazon-kendra-amazon-lex-and-langchain/

- Good example of CDK for setting up Bedrock Agents/KBs
  https://github.com/leegilmorecode/serverless-amazon-bedrock-agents/tree/main

- Good example of simple Bedrock Agent with OpenAPI schema
  https://github.com/aws-samples/agentsforbedrock-retailagent/tree/main
  https://github.com/aws-samples/agentsforbedrock-retailagent/blob/main/workshop/test_retailagent_agentsforbedrock.ipynb

- Amazon Bedrock Generative AI Constructs announcement
  https://aws.amazon.com/events/?sc_icampaign=aware_aws-events&sc_ichannel=ha&sc_icontent=awssm-2021_event&sc_iplace=blog-sidebar&trk=ha_awssm-2021_event
