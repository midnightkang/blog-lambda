import React from "react";
import "./App.css";
import nl2br from "react-nl2br";
import { Link, useParams, useNavigate, BrowserRouter, Route, Routes } from "react-router-dom";

interface Post {
  title: string;
  content: string;
  created: string;
  modified?: string;
}
interface PostListItem {
  title: string;
  created: string;
}
function formatDate(data: string): string {
  return new Date(Date.parse(data)).toLocaleString("ko");
}
async function createPost(title: string, content: string): Promise<{ title: string }> {
  return (
    fetch(`${process.env.REACT_APP_API_ENDPOINT}/api/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    })
      //json메서드는 Response 객체의 메서드 중 하나이며, HTTP 응답의 본문을 JSON 형식으로 파싱하여 JavaScript 객체로 반환
      .then((r) => r.json())
  );
}

async function readPost(title: string): Promise<Post> {
  return fetch(`${process.env.REACT_APP_API_ENDPOINT}/api/post/${title}`).then((r) => r.json());
}

async function updatePost(oldtitle: string, title: string, content: string): Promise<boolean> {
  return fetch(`${process.env.REACT_APP_API_ENDPOINT}/api/post/${oldtitle}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content }),
  }).then((r) => r.json());
}
async function deletePost(title: string): Promise<void> {
  const response = await fetch(`${process.env.REACT_APP_API_ENDPOINT}/api/post/${title}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`글 삭제 에러`);
  }
}

async function listPost(): Promise<PostListItem[]> {
  return fetch(`${process.env.REACT_APP_API_ENDPOINT}/api/post`).then((r) => r.json());
}

//글 목록 컴포넌트.
function PostList({ postItems}: { postItems: PostListItem[]}) {
  return (
    <div>
      <ul>
        {postItems.map((item) => (
          //부모나 자식이 직접 선언되는 경우에는 식별자를 작동으로 생성 할 수 있지만
          //반복해서 생성되는 li 요소의 경우에는 직접 고유 키를 지정해야 한다. title은 고유하므로 이를 고유 키로 지정한다.
          //이 키는 추후 각 구성 요소가 다시 렌더링될 필요가 있을지 검사할 때 사용된다.
          //Link의 to속성을 이용해서 글 항목을 클릭했을 때 글에 해당하는 주소로 이동하도록 함.
          <li key={item.title}>
            <Link to={`/${item.title}`}>
              [{formatDate(item.created)}]{item.title}
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/_new">새 글</Link>
    </div>
  );
}
//글 내용 컴포넌트에서 사용할 글 내용 생성 혹은 수정시간 컴포넌트
function DateField({ label, date }: { label: string; date?: string }) {
  //date값이 전달되지 않았다면 null을 반환. react는 null이나 false는 렌더링하지 않는다.
  if (!date) {
    return null;
  }
  return (
    //<></>로 감싸서 상위 컴포넌트에 자식 컴포넌트로 추가.
    <>
      <dt>{label}</dt>
      <dd>{formatDate(date)}</dd>
    </>
  );
}
//글 내용 컴포넌트
function Viewer({ post}: { post: Post }) {
  return (
    <div>
      <h1>{post.title}</h1>
      <dl>
        <DateField label="생성시각" date={post.created} />
        <DateField label="수정시각" date={post.created} />
        <dt>내용</dt>
        <dd>
          <p>{nl2br(post.content)}</p>
        </dd>
      </dl>
      <Link to="/">글 목록</Link>
      &nbsp;&nbsp;
      <Link to={`/${post.title}/edit`}>수정</Link>
    </div>
  );
}

//글 수정 컴포넌트
function Editor({
  post,
  onSave,
  onCancel,
  onDelete,
}: {
  post: Post | null;
  onSave: (title: string, content: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  //title상태의 초기값은 post.title 혹은 ""
  const [title, setTitle] = React.useState<string>(post?.title ?? "");
  //content상태의 초기값은 post.content 혹은 ""
  const [content, setContent] = React.useState<string>(post?.content ?? "");
  return (
    <div>
      <dl>
        <dt>제목</dt>
        <dd>
          <input type="text" defaultValue={title} placeholder="글 제목" onChange={(event) => setTitle(event.target.value)} />
        </dd>
        <DateField label="생성" date={post?.created} />
        <DateField label="수정" date={post?.modified} />
        <dt>내용</dt>
        <dd>
          <textarea defaultValue={content} placeholder="글 내용" onChange={(event) => setContent(event.target.value)} />
        </dd>
      </dl>
      <button onClick={onCancel}>취소</button>
      <button onClick={() => onSave(title, content)}>저장</button>
      {post && <button onClick={onDelete}>삭제</button>}
    </div>
  );
}

function PostListPage(){
  const [postItems,setPostItems]= React.useState<PostListItem[]>([]);
  React.useEffect(()=>{
    listPost().then(setPostItems).catch(alert);
  },[]);
  return <PostList postItems={postItems}/>;
}

function PostViewPage(){
  const {title} = useParams<"title">();
  const [post,setPost] = React.useState<Post|null>(null);
  React.useEffect(()=>{
    readPost(title!).then(setPost).catch(alert);
  },[title]);
  if(!post){
    return <p>불러오는 중. . .</p>;
  }
  return <Viewer post={post}/>;
}

function PostNewPage(){
  const navigate = useNavigate();
  return (
    <Editor
      post={null}
      onSave={(title,content)=>
        createPost(title,content)
          .then(()=>navigate(`/${title}`,{replace:true}))
          .catch(alert)
      }
      onCancel={()=>navigate(-1)}
      onDelete={()=>{}}
    />
  )
}

function PostEditPage(){
  const navigate = useNavigate();
  const {title}=useParams<"title">();
  const [post,setPost]=React.useState<Post|null>(null);

  React.useEffect(()=>{
    readPost(title!).then(setPost).catch(alert);
  },[title]);

  if(!post){
    return <p>불러오는 중. . .</p>;
  }
  return (
    <Editor
      post={post}
      onSave={(title,content)=>
        updatePost(post.title,title,content)
          .then(()=>navigate(`/${title}`,{replace:true}))
          .catch(alert)  
      }
      onCancel={()=>navigate(-1)}
      onDelete={()=>
        deletePost(post.title)
          .then(()=>navigate(`/`,{replace:true}))
          .catch(alert)
      }
    />
  );
}
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<PostListPage />} />
        <Route path="/_new" element={<PostNewPage />} />
        <Route path="/:title" element={<PostViewPage />} />
        <Route path="/:title/edit" element={<PostEditPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
