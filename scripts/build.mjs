#!/usr/bin/env node
// Bundles src/server.ts with esbuild, see docs/adr/0004-esbuild-single-file-bundle.md.
//
//   node scripts/build.mjs          build/main.prod.js: one minified file with every dependency,
//                                   the only file the image runs
//   node scripts/build.mjs --dev    build/main.dev.js: the same bundle, not minified, with a source map
//   node scripts/build.mjs --watch  the dev build on every change, with the server restarted on it
//
// esbuild does not type-check: `yarn build` runs `tsc --noEmit` first.
import { spawn } from 'node:child_process'
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')
const dev = watch || process.argv.includes('--dev')
const outfile = `build/main.${dev ? 'dev' : 'prod'}.js`

const options = {
  entryPoints: ['src/server.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node26',
  // an ES module like the package itself ("type": "module"); without code splitting, puppeteer's lazy
  // `import()`s are inlined, so the file needs nothing next to it
  format: 'esm',
  // bundled CommonJS packages require() node's builtins, an ES module has to create that function itself;
  // esbuild does not rename the bundle's own top-level names around the banner, hence the unusual alias
  banner: {
    js: "import { createRequire as __bannerCreateRequire } from 'node:module';"
      + ' const require = __bannerCreateRequire(import.meta.url);',
  },
  // optional peers that are only tried in a try/catch: proxy-agent by @puppeteer/browsers when downloading
  // a browser (we never do), bufferutil and utf-8-validate by ws (native addons, node 26 does not need them)
  external: ['proxy-agent', 'bufferutil', 'utf-8-validate'],
  // dev bundles the dependencies as well: a build takes well under a second, and node could not import
  // every CommonJS package's named exports from node_modules
  ...(dev ? {
    sourcemap: true,
  } : {
    minify: true,
    legalComments: 'none',
    // express and others check it at runtime, the image never sets it (webpack's production mode did the same)
    define: { 'process.env.NODE_ENV': '"production"' },
  }),
  logLevel: 'info',
}

if (watch) {
  const context = await esbuild.context(options)
  await context.rebuild()
  await context.watch()
  // node restarts the server whenever the bundle changes
  const server = spawn(process.execPath, ['--enable-source-maps', '--watch', outfile], { stdio: 'inherit' })
    .on('exit', (code) => process.exit(code ?? 0))
  // stopping the watcher stops the server too
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.kill(signal))
  }
} else {
  await esbuild.build(options)
}
