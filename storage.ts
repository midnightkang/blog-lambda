import { PutItemInputAttributeMap } from "aws-sdk/clients/dynamodb";
import { Post, PostListItem } from "./models";
import { DynamoDB } from "aws-sdk";
import { deepEqual } from "fast-equals";

const db = !process.env.IS_OFFLINE
  ? new DynamoDB.DocumentClient()
  : new DynamoDB.DocumentClient({
    region: "localhost",
    endpoint: "http://localhost:8000",
  });
const TableName = "post";
const listTitle = "$_";
const maxRetryCount = 10;

//최근 작성된 순서로 글 목록을 조회하는 방법.
//관계형 데이터베이스에서는 단순히 쿼리나 스캔을 사용해서 가능하지만
//키-값 데이터베이스에서는 데이터가 여러 파티션에 분산되어 있다는 특성상 추가 조치가 필요.
//1.글 데이터를 하나의 파티션에 모으고 정렬 키를 지정해 정렬한다. -> 데이터를 파티션에 분산되어 저장함에 따른 이점을 잃는다.
//2.보조인덱스사용 -> 인덱스를 관리하기 위한 비용이 든다.
//3.글 목록에 대한 문서를 만들고 버전을 직접 관리 -> 문서의 속성값에 글 목록을 유지한다는 점에서 속성값의 크기만큼 글 목록이 유지가능하다.
//여기선 3번을 구현한다.
interface Posts {
  //title속성 값은 post 테이블에 미리 정의한 title인 $_값이며 이 속성은 키의 역할을 함.
  title: typeof listTitle;
  //version속성으로 동시 수정을 방지.
  //동시 수정 시나리오
  //글 목록이 A,B인 상황에서 목록에 C를 추가
  //글 목록이 A,B인 상황에서 목록에 D를 추가
  //C 추가 완료 -> 글 목록 A,B,C
  //D 추가 완료 -> 글 목록 A,B,D
  //원했던 결과는 A,B,C,D지만 A,B,D가 되어버림.
  //따라서 D를 추가 할 때 버전의 정보를 확인하여 이러한 상황을 캐치하고 목록을 최신화하여 다시 D를 추가.
  //최대 재시도 횟수maxRetryCount는 10번으로 한다.
  version: number;
  //entries 속성값은 전체 글 목록
  entries: PostListItem[];
}

//테이블에 항목 추가
async function createItem<T extends DynamoDB.DocumentClient.PutItemInputAttributeMap>(item: T): Promise<void> {
  await db
    .put({
      TableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(title)",
    })
    .promise();
}
//글 목록 문서 반환
async function fetchPosts(): Promise<Posts> {
  const postsObject = await db.get({ TableName, Key: { title: listTitle } }).promise();
  return (postsObject.Item as Posts) ?? { title: listTitle, version: 0, entries: [] };
}

//버전 업데이트
async function updateItem<T extends { version: number }>(item: T): Promise<void> {
  await db
    .put({
      TableName,
      Item: item,
      ConditionExpression: "version=:version",
      ExpressionAttributeValues: { ":version": item.version - 1 },
    })
    .promise();
}

//글 목록 갱신.
async function modifyPostEntries(modify: (entries: PostListItem[]) => PostListItem[]): Promise<void> {
  for (let i = 0; i < maxRetryCount; ++i) {
    //테이블에서 Posts를 가져옴.
    const posts = await fetchPosts();
    const entries =
      //Posts의 글 목록을 modify함수로 갱신.
      modify(posts.entries)
        //created를 기준으로 내림차순 정렬
        //비교함수가 양수면 b가 더 낮은 인덱스로 이동
        .sort((a, b) => {
          //b.created가 a.created보다 사전적으로 더 뒤에 위치하면(더 최신 날짜) 1을 반환.
          return b.created.localeCompare(a.created);
        });
    try {
      //테이블에 기록된 글 목록(posts.entries)과 변경 후의 글 목록(entries)에서 변경점이 발생했는지 확인.
      if (!deepEqual(posts.entries, entries)) {
        const newPosts = { ...posts, version: posts.version + 1, entries };
        if (posts.version === 0) {
          await createItem(newPosts);
        } else {
          await updateItem(newPosts);
        }
      }
      return;
    } catch (error) {
      if ((error as any).code === "ConditionalCheckFailedException" || (error as any).retryable) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("글 목록 수정 실패");
}

export async function insert(post: Post): Promise<boolean> {
  try {
    await createItem(post);
    await modifyPostEntries((entries) => entries.concat({ title: post.title, created: post.created }));
  } catch (error: any) {
    if (error.code === "ConditionalCheckFailedException" || error.retryable) {
      return false;
    }
    throw error;
  }
  return true;
}

export async function select(title: string): Promise<Post | null> {
  const postData = await db.get({ TableName, Key: { title } }).promise();
  return (postData.Item as Post) ?? null;
}

export async function update(oldTitle: string, post: Omit<Post, "created">): Promise<boolean> {
  if (oldTitle === post.title) {
    await db
      .update({
        TableName,
        Key: { title: post.title },
        UpdateExpression: "Set content = :content, modified = :modified",
        ExpressionAttributeValues: {
          ":content": post.content,
          ":modified": post.modified!,
        },
      })
      .promise();
  } else {
    const oldPost = await select(oldTitle);
    if (oldPost === null) return false;
    if ((await select(post.title)) !== null) return false;

    const newPost = { ...oldPost, ...post };
    try {
      await db
        //batchWrite과는 다르게 transacWrit는 요청 집합의 원자적 수행을 보장.
        .transactWrite({
          TransactItems: [
            {
              //예전글 삭제(예전 글이 있을때만 삭제(동시성 이슈))
              Delete: {
                TableName,
                Key: { title: oldTitle },
                ConditionExpression: "attribute_exists(title)",
              },
            },
            {
              //새글 추가(새글이 없을때만 삭제(동시성 이슈))
              Put: {
                TableName,
                Item: newPost,
                ConditionExpression: "attribute_not_exists(title)",
              },
            },
          ],
        })
        .promise();
      await modifyPostEntries((entries) => entries.filter((entry) => entry.title !== oldTitle).concat({ title: newPost.title, created: newPost.created }));
    } catch (error) {
      if ((error as any).code === "ConditionalCheckFailedException" || (error as any).retryable) {
        return false;
      }
    }
    return true;
  }
  return true;
}

export async function remove(title: string): Promise<void> {
  await db
    .delete({
      TableName,
      Key: { title },
    })
    .promise();
  await modifyPostEntries((entries) => entries.filter((entry) => entry.title !== title));
}

export async function list(): Promise<PostListItem[]> {
  return (await fetchPosts()).entries;
}
