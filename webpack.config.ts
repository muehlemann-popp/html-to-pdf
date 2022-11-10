import { Configuration } from 'webpack'
import { resolve } from 'path'
import TerserPlugin from 'terser-webpack-plugin'

const isProdBuild: boolean = process.env.NODE_ENV === 'production'
const buildSuffix: string = isProdBuild ? 'prod' : 'dev'

const config: Configuration = {
  entry: './src/server.ts',
  mode: isProdBuild ? 'production' : 'development',
  // We want to make sure we're not adding anything we don't need like browser libraries
  target: 'async-node',
  output: {
    path: resolve(__dirname, 'build'),
    filename: `[name].${buildSuffix}.js`,
    publicPath: '/',
    // we need to target CommonJS, otherwise node cannot execute file
    libraryTarget: 'commonjs',
  },
  resolve: {
    roots: [__dirname],
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '~': resolve('src/'),
    },
  },
  module: {
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
  // we better bundle everything into 1 script file to ease docker image creation, thus commented out below
  // cannot use optimize.LimitChunkCountPlugin because of https://stackoverflow.com/a/73318866/2848264
  externals: [
    isProdBuild ? {} : /^[a-z\-0-9]+$/, // Ignore node_modules folder
  ],
}

export default config
