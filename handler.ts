import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import "source-map-support";
import { Post , PostListItem} from "./models";
import * as storage from "./storage";

export const createPost: APIGatewayProxyHandlerV2 = async (event) => {
  if (!event.body) {
    return { statusCode: 404 };
  }
  const { title, content } = JSON.parse(event.body);
  const created = new Date().toISOString();

  if (!(await storage.insert({ title, content, created }))) {
    return { statusCode: 400 };
  }
  return { title };
};

export const updatePost: APIGatewayProxyHandlerV2 = async (event) => {
  if (!event.body || !event.pathParameters || !event.pathParameters.title) {
    return { statusCode: 404 };
  }
  const oldTitle = event.pathParameters.title;
  const { title, content } = JSON.parse(event.body);
  const modified = new Date().toISOString();

  if (!(await storage.update(oldTitle, { title, content, modified }))) {
    return { statusCode: 400 };
  }
  return { title };
};

export const readPost: APIGatewayProxyHandlerV2<Post> = async (event) => {
  if (!event.pathParameters || !event.pathParameters.title) {
    return { statusCode: 404 };
  }

  const post = await storage.select(event.pathParameters.title);

  if(!post){
    return { statusCode: 404};
  }
  return post;
};

export const deletePost: APIGatewayProxyHandlerV2 = async (event) => {
  if (!event.pathParameters || !event.pathParameters.title) {
    return { statusCode: 404 };
  }
  await storage.remove(event.pathParameters.title);
  return { statusCode: 200 };
}

export const listPosts: APIGatewayProxyHandlerV2<PostListItem[]> = async () => {
  return storage.list();
}