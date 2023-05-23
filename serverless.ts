import type { AWS } from "@serverless/typescript";

const config: AWS = {
  service: "blog-lambda",
  frameworkVersion: "3",
  provider: {
    name: "aws",
    runtime: "nodejs14.x",
    stage: "dev",
    region: "ap-northeast-2",
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
  resources:{
    Resources: {},
  },
  plugins: ["serverless-webpack"],
};

export = config;