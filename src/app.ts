import express from 'express'
import { json } from 'body-parser'
import { init as sentry, Handlers as SentryHandlers } from '@sentry/node'
import { Integrations as SentryTracing } from '@sentry/tracing'
import router from '~/router'

const app: express.Application = express()
const appConfigure = (): void => {
  app.use(json({ limit: '30mb' }))
  app.use('/', router)
}
const {
  SENTRY_DSN,
  ENV,
  RELEASE_ID,
} = process.env

if (SENTRY_DSN) {
  sentry({
    dsn: SENTRY_DSN,
    environment: ENV,
    release: RELEASE_ID,
    integrations: [
      new SentryTracing.Express({
        // trace all requests to the default router
        app,
      }),
    ],
  })
  // order matters, see https://docs.sentry.io/platforms/node/guides/express/
  app.use(SentryHandlers.requestHandler() as express.RequestHandler)
  appConfigure()
  app.use(SentryHandlers.errorHandler() as express.ErrorRequestHandler)
} else {
  appConfigure()
}

export default app
