import { Post, PostListItem, Posts } from "./models";
import { DynamoDB } from "aws-sdk";
import { deepEqual } from "fast-equals";

//최근 작성된 순서로 글 목록을 조회하는 방법.
//관계형 데이터베이스에서는 단순히 쿼리나 스캔을 사용해서 가능하지만
//키-값 데이터베이스에서는 데이터가 여러 파티션에 분산되어 있다는 특성상 추가 조치가 필요.
//1.글 데이터를 하나의 파티션에 모으고 정렬 키를 지정해 정렬한다. -> 데이터를 파티션에 분산되어 저장함에 따른 이점을 잃는다.
//2.보조인덱스사용 -> 인덱스를 관리하기 위한 비용이 든다.
//3.글 목록에 대한 문서를 만들고 버전을 직접 관리 -> 문서의 속성값에 글 목록을 유지한다는 점에서 속성값의 크기만큼 글 목록이 유지가능하다.
//여기선 3번을 구현한다.
//버전을 관리하는 이유는 동시 수정을 방지하기 위함.
//동시 수정 시나리오
//글 목록이 A,B인 상황에서 목록에 C를 추가
//글 목록이 A,B인 상황에서 목록에 D를 추가
//C 추가 완료 -> 글 목록 A,B,C
//D 추가 완료 -> 글 목록 A,B,D
//원했던 결과는 A,B,C,D지만 A,B,D가 되어버림.
//따라서 D를 추가 할 때 버전의 정보를 확인하여 이러한 상황을 캐치하고 재시도.
//최대 재시도 횟수maxRetryCount는 10번

//serverless-offline을 사용해 로컬 테스트 서버를 기동하면 IS_OFFLINE환경 변수가 설정됨.
//IS_OFFLINE 환경 변수를 이용해서 로컬 db사용여부를 판단.
const db = !process.env.IS_OFFLINE
  ? new DynamoDB.DocumentClient()
  : new DynamoDB.DocumentClient({
      region: "localhost",
      endpoint: "http://localhost:8000",
    });
//테이블 이름
const TableName = "post";
//글 목록 문서를 갱신할때 동시성 문제가 발생하면 재시도 하는데, 이 재시도 횟수의 최대 횟수.
const maxRetryCount = 10;
//항목(글 목록 문서)의 title속성 값.
const listTitle = "$_";

//db에 항목을 새로 추가하는 함수 (새로운 글을 추가할 때, 글 목록 문서를 처음에 추가할때 호출)
//기존에 테이블에 있는 항목과 title 속성 값이 중복되면 수행x
async function createItem<T extends DynamoDB.DocumentClient.PutItemInputAttributeMap>(item: T): Promise<void> {
  await db
    .put({
      TableName,
      Item: item,
      //이미 동일한 title 속성 값을 갖는 항목이 있다면 ConditionalCheckFailedException오류 발생.
      ConditionExpression: "attribute_not_exists(title)",
    })
    .promise();
}
//글 목록 문서를 가져와서 반환하는 함수 (db에 글 목록 문서가 없을 때는 기본 템플릿 반환)
async function fetchPosts(): Promise<Posts> {
  const postsObject = await db.get({ TableName, Key: { title: listTitle } }).promise();
  return (postsObject.Item as Posts) ?? { title: listTitle, version: 0, entries: [] };
}
//테이블에 있는 글 목록 문서를 업데이트하는 함수.
//put이지만 글 목록 문서는 title이 항상 같으므로 업데이트 됨(테이블의 해쉬 키를 title로 지정했음)
//기존에 테이블에 있는 글 목록 문서가 바로 이전 버전일 때만 수행
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

//db에 글 목록 문서를 삽입 또는 db에 있는 글 목록 문서 업데이트 
async function modifyPostEntries(modify: (entries: PostListItem[]) => PostListItem[]): Promise<void> {
  for (let i = 0; i < maxRetryCount; ++i) {
    //글 목록 문서를 가져옴.
    const posts = await fetchPosts();
    //최신 날짜로 정렬한 갱신된 글 목록을 변수에 담음.
    const entries =
      //Posts의 글 목록을 콜백함수modify로 갱신.(콜백함수는 modifyPostEntries를 호출할때 매개변수에 전달된 함수로 정의 됨)
      modify(posts.entries)
        //created를 기준으로 내림차순 정렬
        //비교함수가 양수면 b가 더 낮은 인덱스로 이동
        .sort((a, b) => {
          //b.created가 a.created보다 사전적으로 더 뒤에 위치하면(더 최신 날짜) 1을 반환.
          return b.created.localeCompare(a.created);
        });
    try {
      //기존 글 목록(posts.entries)과 변경 후의 글 목록(entries)에서 변경점이 발생했는지 확인.
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

//db에 글 추가, 글 목록 문서 갱신
export async function insert(post: Post): Promise<boolean> {
  try {
    //db에 글 항목 삽입.
    await createItem(post);
    //db에 글 목록 문서 갱신
    await modifyPostEntries(
      (entries) => entries.concat({ title: post.title, created: post.created })
    );
  } catch (error: any) {
    if (error.code === "ConditionalCheckFailedException" || error.retryable) {
      return false;
    }
    throw error;
  }
  return true;
}

//db에 있는 글 조회.
export async function select(title: string): Promise<Post | null> {
  const postData = await db.get({ TableName, Key: { title } }).promise();
  return (postData.Item as Post) ?? null;
}

//db에 있는 글 업데이트,글 목록 문서 갱신
export async function update(oldTitle: string, post: Omit<Post, "created">): Promise<boolean> {
  //이전 글 제목과 새로운 글 제목이 같다면 이전 항목 업데이트 
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
  }
  //이전 글 제목과 새로운 글 제목이 다르다면 이전 항목 삭제 , 새로운 글 삽입 .
  else {
    const oldPost = await select(oldTitle);
    if (oldPost === null) return false;
    //새로운 글 제목이 이미 db에 있다면 진행 x 
    if ((await select(post.title)) !== null) return false;
    //객체 병합을 이용해서 이전 글의 created속성 값 가져오기 .
    const newPost = { ...oldPost, ...post };
    try {
      //db에 기존 항목 삭제 , 새로운 항목 삽입.
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
      //글 목록 문서 갱신
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

//db에 있는 글 삭제,글 목록 문서 갱신
export async function remove(title: string): Promise<void> {
  await db
    .delete({
      TableName,
      Key: { title },
    })
    .promise();
  await modifyPostEntries((entries) => entries.filter((entry) => entry.title !== title));
}

//글 목록 조회.
export async function list(): Promise<PostListItem[]> {
  const posts = await fetchPosts()
  const entries = posts.entries
  return entries;
}
