import webpack, { type Configuration } from 'webpack'
import { resolve } from 'path'
import TerserPlugin from 'terser-webpack-plugin'

const { IgnorePlugin } = webpack
const isProdBuild: boolean = process.env.NODE_ENV === 'production'
const buildSuffix: string = isProdBuild ? 'prod' : 'dev'

const config: Configuration = {
  entry: './src/server.ts',
  mode: isProdBuild ? 'production' : 'development',
  // We want to make sure we're not adding anything we don't need like browser libraries
  target: 'node',
  // an ES module like the package itself ("type": "module")
  experiments: { outputModule: true },
  output: {
    path: resolve(import.meta.dirname, 'build'),
    filename: `[name].${buildSuffix}.js`,
    module: true,
    chunkFormat: 'module',
    library: { type: 'module' },
  },
  resolve: {
    roots: [import.meta.dirname],
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '~': resolve('src/'),
    },
  },
  module: {
    parser: {
      // puppeteer lazy-loads some modules with `import()`, inline them to keep a single output file
      javascript: { dynamicImportMode: 'eager' },
    },
    rules: [{
      test: /\.ts$/,
      use: 'ts-loader',
      exclude: /node_modules/,
    }],
  },
  // Do not generate LICENCE file
  // https://github.com/webpack-contrib/terser-webpack-plugin/issues/229#issuecomment-761294644
  optimization: {
    minimizer: [new TerserPlugin({ extractComments: false })],
  },
  plugins: [
    // optional peers that are only tried in a try/catch: proxy-agent by @puppeteer/browsers when downloading
    // a browser (we never do), bufferutil and utf-8-validate by ws (native addons, node 24 does not need them)
    new IgnorePlugin({ resourceRegExp: /^(proxy-agent|bufferutil|utf-8-validate)$/ }),
  ],
  // we better bundle everything into 1 script file to ease docker image creation, thus commented out below
  // cannot use optimize.LimitChunkCountPlugin because of https://stackoverflow.com/a/73318866/2848264
  externals: [
    isProdBuild ? {} : /^[a-z\-0-9]+$/, // Ignore node_modules folder
  ],
  // required rather than imported: node cannot detect the named exports of every CommonJS package
  externalsType: 'node-commonjs',
}

export default config
