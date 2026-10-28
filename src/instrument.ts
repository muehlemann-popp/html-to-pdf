import { init } from '@sentry/node'

/**
 Sentry has to be initialised before the app is loaded, so src/server.ts imports this module first.

 The image runs one bundle with every dependency inside it (docs/adr/0004-esbuild-single-file-bundle.md),
 so Sentry's automatic instrumentation, which patches packages as node loads them, never sees Express:
 errors reach Sentry through its Express error handler (src/app.ts) and the captureException calls of
 src/util/log-request.ts. Without SENTRY_DSN the SDK is not initialised at all and both are no-ops.
*/
const { SENTRY_DSN, ENV, RELEASE_ID } = process.env

if (SENTRY_DSN) {
  init({
    dsn: SENTRY_DSN,
    environment: ENV,
    release: RELEASE_ID,
    // the hooks instrument packages imported from node_modules, the bundle imports none
    registerEsmLoaderHooks: false,
  })
}
