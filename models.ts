export interface Post {
  title: string;
  content: string;
  created: string;
  modified?: string
}

export interface PostListItem {
  title: string;
  created: string;
}