# 0004 — esbuild builds the single-file bundle, not webpack

**Date:** 2026-10-26 · **Status:** accepted · **Context:**
[dependency upgrade plan](../plans/dependency-upgrade.md) ("Not in scope": dropping webpack), the
tooling pull request that made the package an ES module

## Context

The `prod` image runs one file, `main.prod.js`, with no `node_modules` next to it: `deploy/Dockerfile`
copies only that file out of the builder stage. Whatever builds it has to inline every dependency,
including puppeteer 25, which is ESM-only and loads parts of itself lazily with `import()`.

Until now webpack 5 built it, configured by `webpack.config.ts` and loaded through `ts-node` with a
second tsconfig (`tsconfig.webpack.json`) and `env-cmd` with `.env.dev`/`.env.prod` to choose the
mode. It needed `dynamicImportMode: 'eager'` to keep puppeteer's lazy imports out of separate chunk
files, an `IgnorePlugin` for optional peers, `terser-webpack-plugin` to stop it writing a licence
file, and `ts-loader` to compile. `yarn start` ran webpack in watch mode and `nodemon` in parallel
through `npm-run-all`. Eight dev dependencies, two config files and two env files, for what is one
`bundle this entry point` call.

With the package now an ES module, the bundle has to be one too.

## Decision

`scripts/build.mjs` calls esbuild's API:

- one ES module, `platform: node`, `target: node26`, no code splitting, so puppeteer's `import()`s are
  inlined without any option;
- a banner that creates `require` with `createRequire(import.meta.url)`: bundled CommonJS packages
  call `require()` for node's builtins, which an ES module does not have. esbuild does not rename the
  bundle's own top-level names around a banner, so the import is aliased to a name nothing else uses;
- `proxy-agent`, `bufferutil` and `utf-8-validate` stay external, as webpack's `IgnorePlugin` had
  them: optional peers only tried inside a `try`;
- prod is minified and defines `process.env.NODE_ENV` as `"production"`, which webpack's production
  mode did implicitly and which, for example, keeps Express's default error page free of stack
  traces;
- the page of `GET /` is rendered at build time (`scripts/readme-html.mjs`: `marked` plus an inline
  stylesheet) and defined as the global `README_HTML`; `vitest.config.mts` defines it the same way;
- `--dev` writes the same bundle unminified with a source map to `build/main.dev.js`;
- `--watch` (`yarn start`) rebuilds the dev bundle on change and runs it with `node --watch`, which
  restarts it when the bundle changes.

esbuild does not type-check, so `yarn build` runs `tsc --noEmit` first (ts-loader type-checked as part
of the webpack build). The image's builder stage runs `yarn build`, so a type error still fails the
image build.

The `prod` image writes a `package.json` with `"type": "module"` next to the bundle, so node loads it
as an ES module because it is declared, not because its syntax detection guessed it.

## Alternatives

- **Keep webpack.** It works as an ES module build (that was the first commit of this change), but
  needs the plugins and workarounds above plus `externalsType: 'node-commonjs'` for the dev build, and
  every one of them is a place for the next major to break.
- **`tsc` plus `node_modules` in the image.** No bundler at all, and Sentry's automatic
  instrumentation (which patches modules as node loads them) would see Express. But the image would
  have to carry a production `node_modules` (puppeteer, `@sentry/node` with OpenTelemetry), and the
  "one file" property that keeps the `prod` stage trivial is gone. Nothing here needs the
  instrumentation: the service reports errors, not traces.
- **Node's own TypeScript support** (type stripping). It runs neither the `~/` path alias, nor `enum`
  without `--experimental-transform-types`, nor imports without file extensions, and it still does not
  bundle.
- **Dependencies external in the dev build**, as webpack's dev build did. Node then has to import
  CommonJS packages' named exports itself and cannot for some (`body-parser`'s `json`); a full build
  takes well under a second anyway.

## Consequences

- Dev dependencies `webpack`, `webpack-cli`, `ts-loader`, `terser-webpack-plugin`, `ts-node`,
  `env-cmd`, `nodemon` and `npm-run-all` are gone, replaced by `esbuild`; so are `webpack.config.ts`,
  `tsconfig.webpack.json` and `.env.dev`/`.env.prod`.
- A build takes well under a second instead of a few seconds.
- The bundle is larger than webpack's (2.0 MB against 1.4 MB). Most of the difference is
  `iconv-lite`'s code-page tables that `body-parser` pulls in; they sit in CommonJS wrappers that only
  run when required.
- Memory, measured per commit of the tooling change (anonymous memory of the idle node process in
  the `prod` image, no browser started): 25 MiB on `main`, 26 as an ES module still built by webpack,
  28 with esbuild, 33 after Sentry 10 (its OpenTelemetry modules are evaluated at import, with or
  without a DSN). The same esbuild code as CommonJS uses 3 MiB less than as an ES module.
  `scripts/benchmark.mjs`, two rounds per image: every scenario's anonymous peak is 7–13 MiB higher
  (8 concurrent PDFs: 218–230 MiB before, 225–227 after), latency is the same within noise, and the
  reference outputs are identical apart from the PDFs' creation dates.
- `tsconfig.json` uses `moduleResolution: Bundler`: imports stay without file extensions, which is
  what esbuild and Vitest resolve.
- The bundle still contains everything, so Sentry's auto-instrumentation of Express does not apply;
  errors reach Sentry through its Express error handler, see `src/instrument.ts`. Checked against the
  built bundle with a local stand-in for Sentry: `/debug-sentry` and a failing `/selfcheck` both arrive.
