export interface Post {
  title: string;
  content: string;
  created: string;
  modified?: string;
}

export interface PostListItem {
  title: string;
  created: string;
}

//글 목록 문서 모델.
export interface Posts {
  title: string;
  version: number;
  entries: PostListItem[];
}
