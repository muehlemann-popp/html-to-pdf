import { TimeoutError } from 'puppeteer'

/**
 The page the caller asked for could not be rendered (bad URL or selector, unreachable site, timeout),
 while the service itself is fine: answered with a 4xx/5xx status, not retried, and neither the
 browser nor the node process is replaced, see README "Errors".
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

// a waitForSelector the page rejects as CSS or XPath syntax, e.g. "SyntaxError: Failed to execute
// 'querySelector' on 'Document': '#' is not a valid selector.", or a puppeteer ::-p-… extension that
// does not exist ("Unknown selector type: madeup", thrown by puppeteer's script in the page)
const invalidSelector = /SyntaxError: Failed to execute '\w+' on '\w+'|^Unknown selector type: /

// DNS, connection, proxy, TLS, certificate, redirect and response failures of the requested site
// (codes from Chromium's net/base/net_error_list.h)
const siteFailure = new RegExp(`net::ERR_(${[
  'NAME_NOT_RESOLVED',
  'NAME_RESOLUTION_FAILED',
  'ADDRESS_INVALID',
  'ADDRESS_UNREACHABLE',
  'CONNECTION_[A-Z_]+',
  'TIMED_OUT',
  'TUNNEL_CONNECTION_FAILED',
  'PROXY_[A-Z_]+',
  'SOCKS_[A-Z_]+',
  'SSL_[A-Z_]+',
  'BAD_SSL_CLIENT_AUTH_CERT',
  'CERT_[A-Z_]+',
  'TOO_MANY_REDIRECTS',
  'INVALID_REDIRECT',
  'UNSAFE_REDIRECT',
  'EMPTY_RESPONSE',
  'INVALID_RESPONSE',
  'INVALID_HTTP_RESPONSE',
  'RESPONSE_HEADERS_[A-Z_]+',
  'CONTENT_DECODING_[A-Z_]+',
  'CONTENT_LENGTH_MISMATCH',
  'INVALID_CHUNKED_ENCODING',
  'INCOMPLETE_CHUNKED_ENCODING',
  'HTTP2_[A-Z_]+',
  'QUIC_PROTOCOL_ERROR',
  'HTTP_1_1_REQUIRED',
  'BLOCKED_BY_RESPONSE',
].join('|')})\\b`)

// converts navigation errors caused by the requested page, anything else is returned unchanged
export const toTargetError = (e: unknown): unknown => {
  if (e instanceof TimeoutError) {
    return new TargetError(e.message, 504)
  }
  const message = (e as Error)?.message ?? ''
  if (invalidUrl.test(message) || invalidSelector.test(message)) {
    return new TargetError(message, 400)
  }
  if (siteFailure.test(message)) {
    return new TargetError(message, 502)
  }
  // other net errors (ERR_FAILED, ERR_ABORTED, ERR_INSUFFICIENT_RESOURCES, …) are also how Chromium
  // reports a failing renderer or network service, so they get the retry on a fresh browser first
  return e
}

/**
 Converts a navigation error that a fresh browser reproduced: the browser was replaced after the
 first attempt, so the page is the cause (e.g. ERR_ABORTED for a download or an ftp:// URL).
*/
export const toRetriedTargetError = (e: unknown): unknown => {
  const message = (e as Error)?.message ?? ''
  if (!(e instanceof TargetError) && /net::ERR_[A-Z_]+/.test(message)) {
    return new TargetError(message, 502)
  }
  return e
}
