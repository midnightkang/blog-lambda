const OAI = {
  Type: "AWS::CloudFront::CloudFrontOriginAccessIdentity",
  Properties: {
    CloudFrontOriginAccessIdentityConfig: {
      Comment: "블로그 OAI",
    },
  },
};

const BlogStaticFileBucket = {
  Type: "AWS::S3::Bucket",
  Properties: {
    BucketName: process.env.WEBSITE_BUCKET_NAME!,
  },
};

const BlogStaticFileBucketOAIPolicy = {
  Type: "AWS::S3::BucketPolicy",
  Properties: {
    Bucket: { Ref: "BlogStaticFileBucket" },
    PolicyDocument: {
      Statement: [
        {
          Action: "s3:GetObject",
          Effect: "Allow",
          Resource: `arn:aws:s3:::${process.env.WEBSITE_BUCKET_NAME}/*`,
          Principal: {
            CanonicalUser: { "Fn::GetAtt": ["OAI", "S3CanonicalUserId"] },
          },
        },
      ],
    },
  },
};

const BlogStaticFileCdn = {
  Type: "AWS::CloudFront::Distribution",
  Properties: {
    DistributionConfig: {
      Comment: "블로그",
      Enabled: true,
      DefaultRootObject: "index.html",
      //react-router라이브러리를 사용해 프론트엔드를 구성한 경우에 URL에 해당하는 파일이 없을 수 있다.
      //(index.html에서 실행하는 자바스크립트에서 URL을 분석해 그 경로에 맞는 화면을 구성해주기 때문)
      //따라서 403에러(cloudfront가 bucket에서 객체를 찾지 못할 경우)가 발생할 때 index.html파일을 사용하도록 설정해서
      //index.html에서 해당하는 동적 주소에 대한 라우팅이 처리될 수 있도록 한다.
      CustomErrorResponses: [
        {
          ErrorCode: 403,
          ResponseCode: 200,
          ResponsePagePath: "/index.html",
        },
      ],
      Origins: [
        {
          Id: "S3Origin",
          DomainName: `${process.env.WEBSITE_BUCKET_NAME}.s3.ap-northeast-2.amazonaws.com`,
          S3OriginConfig: {
            OriginAccessIdentity: {
              "Fn::Join": ["", ["origin-access-identity/cloudfront/", { Ref: "OAI" }]],
            },
          },
        },
      ],
      DefaultCacheBehavior: {
        TargetOriginId: "S3Origin",
        ViewerProtocolPolicy: "redirect-to-https",
        Compress: true,
        CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
      },
      HttpVersion: "http2",
      Aliases: [`${process.env.SUB_DOMAIN}.${process.env.ROOT_DOMAIN}`],
      ViewerCertificate: {
        AcmCertificateArn: process.env.CERTIFICATE_ARN,
        SslSupportMethod: "sni-only",
        MinimumProtocolVersion: "TLSv1.2_2021",
      },
    },
  },
};

const BlogStaticFileCdnDns = {
  Type: "AWS::Route53::RecordSet",
  Properties: {
    AliasTarget: {
      DNSName: { "Fn::GetAtt": ["BlogStaticFileCdn", "DomainName"] },
      HostedZoneId: "Z2FDTNDATAQYW2",
    },
    HostedZoneName: `${process.env.ROOT_DOMAIN}.`,
    Name: `${process.env.SUB_DOMAIN}.${process.env.ROOT_DOMAIN}`,
    Type: "A",
  },
};

const resources = {
  AWSTemplateFormatVersion: "2010-09-09",
  Resources:{
    OAI,
    BlogStaticFileBucket,
    BlogStaticFileBucketOAIPolicy,
    BlogStaticFileCdn,
    BlogStaticFileCdnDns,
  },
};

export default resources;