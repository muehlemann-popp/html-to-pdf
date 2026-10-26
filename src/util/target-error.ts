import { TimeoutError } from 'puppeteer'

/**
 The page the caller asked for could not be rendered (bad URL, unreachable site, timeout), while the
 service itself is fine: answered with a 4xx/5xx status, not retried, and neither the browser nor the
 node process is replaced, see README "Errors".
*/
export class TargetError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'TargetError'
    this.status = status
  }
}

// a URL Chromium refuses to load at all
const invalidUrl = new RegExp([
  'Cannot navigate to invalid URL',
  'net::ERR_(INVALID_URL|UNSAFE_PORT|UNKNOWN_URL_SCHEME|DISALLOWED_URL_SCHEME)\\b',
].join('|'))

// converts navigation errors caused by the requested page, anything else is returned unchanged
export const toTargetError = (e: unknown): unknown => {
  if (e instanceof TimeoutError) {
    return new TargetError(e.message, 504)
  }
  const message = (e as Error)?.message ?? ''
  if (invalidUrl.test(message)) {
    return new TargetError(message, 400)
  }
  // DNS, connection, TLS and HTTP-level failures of the requested site
  if (/net::ERR_[A-Z_]+/.test(message)) {
    return new TargetError(message, 502)
  }
  return e
}
