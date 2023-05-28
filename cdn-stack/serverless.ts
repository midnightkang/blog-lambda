import resources from "./s3-cloudfront";

export = {
  service: "simple-blog-pages",
  frameworkVersion: "3",
  provider: {
    name: "aws",
    region: "ap-northeast-2",
  },
  plugins: ["serverless-s3-sync"],
  custom: {
    //s3Sync플러그인 설정.
    s3Sync: [
      {
        bucketName: process.env.WEBSITE_BUCKET_NAME!,
        //업로드할 로컬 파일의 위치
        localDir: "../blog-frontend/build",
        //params로 파일 패턴에 따라 추가 메타데이터 설정을 할 수 있다
        //Content-Type의 경우 s3Sync플러그인에 의해 자동으로 설정됨.
        //추가로 필요한 Cache-Control헤더를 다음과 같이 파일 패턴에 따라 설정한다. 
        params: [{ "index.html": { CacheControl: "no-cache" } }, { "static/**/*": { CacheControl: "public,max-age=31536000" } }],
      },
    ],
  },
  resources,
};
