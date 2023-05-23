import type { AWS } from "@serverless/typescript";

const PostTable = {
  //DynamoDB에서 사용할 테이블을 정의
  Type: "AWS::DynamoDB::Table",
  Properties: {
    //테이블 이름은 post
    TableName: "post",
    //title속성을 HASH키로 사용
    KeySchema: [{ AttributeName: "title", KeyType: "HASH" }],
    //title속성은 문자열.
    AttributeDefinitions: [{ AttributeName: "title", AttributeType: "S" }],
    //PAY_PER_REQUEST:요청 단위로 비용 청구
    //PROVISIONED:프로비저닝된 처리량 비용 청구(프로비저닝된 처리량을 예약하여 사용)(ProvisionedThroughput속성으로 지정)(예측 가능한 트래픽인 경우에 사용)
    BillingMode: "PAY_PER_REQUEST",
  },
};
const PostTableRoleStatement = {
  Effect: "Allow",
  Action: ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"],
  Resource: { "Fn::GetAtt": ["PostTable", "Arn"] },
};
const config: AWS = {
  service: "blog-lambda",
  frameworkVersion: "3",
  provider: {
    name: "aws",
    runtime: "nodejs14.x",
    stage: "dev",
    region: "ap-northeast-2",
    iam: { role: { statements: [PostTableRoleStatement] } },
  },
  functions: {
    createPost: {
      handler: "handler.createPost",
      events: [{ httpApi: { path: "/api/post", method: "post" } }],
    },
    readPost: {
      handler: "handler.readPost",
      events: [{ httpApi: { path: "/api/post/{title}", method: "get" } }],
    },
    updatePost: {
      handler: "handler.updatePost",
      events: [{ httpApi: { path: "/api/post", method: "put" } }],
    },
    deletePost: {
      handler: "handler.deletePost",
      events: [{ httpApi: { path: "/api/post/{title}", method: "delete" } }],
    },
    listPost: {
      handler: "handler.listPost",
      events: [{ httpApi: { path: "/api/post", method: "get" } }],
    },
  },
  resources: {
    Resources: { PostTable },
  },
  plugins: ["serverless-webpack"],
};

export = config;
