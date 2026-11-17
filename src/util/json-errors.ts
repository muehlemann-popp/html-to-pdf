import { ErrorRequestHandler, RequestHandler } from 'express'
import timestamp from '~/util/timestamp'

/**
 What the capture routes answer before a capture starts, in the JSON of README "Errors" like everything
 else, instead of Express's HTML error page: a body that is not JSON (400), larger than the limit of
 src/app.ts (413), or sent with another Content-Type (415).
*/

// express.json leaves req.body undefined when the Content-Type is not JSON; a request that does carry a
// body then would print about:blank with 200, as if it had sent none
export const requireJsonBody: RequestHandler = (req, res, next) => {
  const hasBody = req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length']) > 0
  if (req.body === undefined && hasBody) {
    const contentType = req.headers['content-type']
    res.status(415).json({
      status: 'error',
      message: `unsupported Content-Type${contentType ? ` ${contentType}` : ''}: send the body as JSON with`
        + ' Content-Type: application/json',
    })
    return
  }
  next()
}

interface HttpError extends Error {
  status?: number
  expose?: boolean
}

// after the Sentry error handler, which has already seen the error. Client errors (body-parser's 400 and
// 413) say what was wrong; anything else is the service's own and says nothing about its insides
export const jsonErrorHandler: ErrorRequestHandler = (err: HttpError, req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  const status = Number.isInteger(err.status) && err.status! >= 400 && err.status! < 600 ? err.status! : 500
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[${timestamp()}] Error at ${req.method} ${req.path}. "${err.message}"\n${err.stack}`)
  }
  res.status(status).json({
    status: 'error',
    message: status < 500 && err.expose ? err.message : 'Internal Server Error',
  })
}
