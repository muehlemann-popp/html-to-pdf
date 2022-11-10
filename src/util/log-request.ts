import { performance } from 'perf_hooks'
import { Response } from 'express'
import { captureException } from '@sentry/node'
import timestamp from '~/util/timestamp'

export const logRequestTime = async <T> (
  requestInfo: string,
  preRequestLog: boolean,
  processRequest: () => Promise<T>,
): Promise<T> => {
  const start = performance.now()
  let err: Error | null = null
  let result: T | null = null

  try {
    if (preRequestLog) {
      // eslint-disable-next-line no-console
      console.info(`[${timestamp()}] ${requestInfo}`)
    }
    result = await processRequest()
  } catch (e) {
    err = e as Error
  }

  const status = err === null ? 'ok' : 'error'
  const duration = Math.round(performance.now() - start)

  // eslint-disable-next-line no-console
  console.info(`[${timestamp()}] ${requestInfo}: ${status} in ${duration}ms`)

  if (err) {
    throw err
  }

  return result as T
}

export const processRequestError = async <T> (
  requestInfo: string,
  res: Response,
  rethrow: boolean,
  processRequest: () => Promise<T>,
): Promise<T | null> => {
  let result: T | null = null

  try {
    result = await processRequest()
  } catch (e) {
    const err = e as Error
    // eslint-disable-next-line no-console
    console.error(
      `[${timestamp()}] Error at ${requestInfo}. "${err.message}"\n${err.stack}`,
    )
    res.status(500).json({ status: 'error', message: err.message })
    captureException(err)
    if (rethrow) {
      throw err
    }
  }

  return result
}

const logRequest = async <T> (
  requestInfo: string,
  res: Response,
  preRequestLog: boolean,
  processRequest: () => Promise<T>,
): Promise<T | null> => processRequestError(
  requestInfo,
  res,
  false,
  () => logRequestTime(requestInfo, preRequestLog, processRequest),
)

export default logRequest
