import express from 'express'
import { setupExpressErrorHandler } from '@sentry/node'
import router from '~/router'
import { jsonErrorHandler, requireJsonBody } from '~/util/json-errors'

const app: express.Application = express()

// no "X-Powered-By: Express" on every response
app.disable('x-powered-by')

app.use(express.json({ limit: '30mb' }))
app.use(requireJsonBody)
app.use('/', router)
// after all routes; reports what a route throws (see /debug-sentry, SENTRY_DEBUG=1), a no-op without SENTRY_DSN
setupExpressErrorHandler(app)
// last: answers what is left (a malformed or oversized body, an error thrown by a route) as JSON
app.use(jsonErrorHandler)

export default app
