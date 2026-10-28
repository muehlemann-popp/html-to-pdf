import express from 'express'
import { setupExpressErrorHandler } from '@sentry/node'
import router from '~/router'

const app: express.Application = express()

app.use(express.json({ limit: '30mb' }))
app.use('/', router)
// after all routes; reports what a route throws (see /debug-sentry), a no-op without SENTRY_DSN
setupExpressErrorHandler(app)

export default app
