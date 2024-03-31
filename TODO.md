#### TODOs

- Backend: Test Agent is able to book flight consistently
- UI: Investigate how to hook up API to frontend
- UI: Build streamlit frontend
- Backend: Advanced Prompt Templates to translate responses

#### Reference

- [Bedrock Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [ReInvent Video](https://www.youtube.com/watch?v=JNZPW82uv7w&list=WL&index=13&t=2172s)

### IaC for Bedrock

- https://github.com/awslabs/generative-ai-cdk-constructs
- https://github.com/PieterjanCriel/bedrock-agents-cdk/blob/main/lib/agentStack.ts

#### Other References

- Example using Amazon Generative AI Constructs
  https://github.com/leegilmorecode/serverless-amazon-bedrock-agents/tree/main
- Amazon Bedrock Generative AI Constructs announcement
  https://aws.amazon.com/events/?sc_icampaign=aware_aws-events&sc_ichannel=ha&sc_icontent=awssm-2021_event&sc_iplace=blog-sidebar&trk=ha_awssm-2021_event
- [AWS Generative AI CDK Constructs](https://github.com/awslabs/generative-ai-cdk-constructs)

- Example using Console to create Bedrock Agents
  https://github.com/aws-samples/agentsforbedrock-retailagent/tree/main

- Amazon Bedrock Agents and Knowledge Bases example
  https://blog.serverlessadvocate.com/amazon-bedrock-knowledge-bases-with-private-data-7685d04ef396
  https://github.com/leegilmorecode/serverless-amazon-bedrock-agents/tree/main

- Example of follow up prompt (using Lex instead of Bedrock Agents)
  https://aws.amazon.com/blogs/machine-learning/build-generative-ai-agents-with-amazon-bedrock-amazon-dynamodb-amazon-kendra-amazon-lex-and-langchain/
