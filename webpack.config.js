const path = require("path");
const slsw = require("serverless-webpack");

module.exports = {
  //개발을 위한 빌드인지 상용을 위한 빌드인지 결정.
  mode: slsw.lib.webpack.isLocal ? "development" : "production",

  //웹팩이 빌드를 시작할 진입점
  entry: slsw.lib.entries,

  //빌드한 결과물이 실제 코드의 어느 위치에 대응되는지 확인하는 소스맵파일 생성 옵션
  //보통 상용 빌드를 할 때는 정보를 많이 담은 source-map을 사용하고
  //개발 빌드를 할 때는 수정 후 다시 빌드하는 과정을 단축하기 위해 eval-cheap-module-source-map을 사용
  //코드에 추가하는 source-amp-support패키지에 의해 빌드 결과물이 커지기 때문에 첫 기동 시간을 최적화해야 하는 경우에는 소스맵을 생성 안 하기도 한다.
  devtool: "source-map",

  //웹팩이 처리할 파일을 설정
  resolve: {
    extensions: [".mjs", ".json", ".ts", ".js"],
  },

  //웹팩의 결과물 생성을 설정.
  output: {
    //보통 comminjs2표준을 따르도록 한다.
    //commonjs는 ECMAScript에서 정의한 모듈 규격 중 하나이고 보통 웹 브라우저의 자바스크립트 엔진에서 이 표준을 지킨다.
    //Node.js는 여기에 export문법을 추가해 약간 다른 형태의 모듈 표준을 구현하였고 이를 commonjs2로 정의했다.
    libraryTarget: "commonjs2",
    //관례대로 .webpack디렉토리 하위에 entry로 지정된 파일의 이름을 사용해 [name].js형태로 결과물을 빌드한다.
    path: path.join(__dirname, ".webpack"),
    filename: "[name].js",
  },

  //웹팩의 결과물을 사용할 대상 환경을 지정
  target: "node",

  //웹팩에서 처리할 모듈 설정
  module: {
    rules: [
      {
        //.ts파일에 대해 ts-loader로더를 사용하도록 설정 , 불필요한 의존 패키지를 수행하지 않도록 node_modules 디렉토리 제외
        test: /\.ts$/,
        loader: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  //중간 수준의 빌드 정보를 출력(none,normal,verbose)
  stats: "normal",
};