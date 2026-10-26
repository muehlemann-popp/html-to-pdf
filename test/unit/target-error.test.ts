import { describe, expect, it } from 'vitest'
import { TimeoutError } from 'puppeteer'
import { TargetError, toRetriedTargetError, toTargetError } from '~/util/target-error'

// messages as Puppeteer 25 / Chromium 155 report them
const statusOf = (e: unknown) => (e instanceof TargetError ? e.status : null)

describe('toTargetError', () => {
  it.each([
    ['Protocol error (Page.navigate): Cannot navigate to invalid URL', 400],
    ['net::ERR_UNSAFE_PORT at http://127.0.0.1:1', 400],
    ['net::ERR_UNKNOWN_URL_SCHEME at foo://bar', 400],
    ["SyntaxError: Failed to execute 'querySelector' on 'Document': '#' is not a valid selector.", 400],
    ["SyntaxError: Failed to execute 'evaluate' on 'Document': The string '//[' is not a valid XPath expression.", 400],
    ['net::ERR_NAME_NOT_RESOLVED at http://does-not-exist.invalid', 502],
    ['net::ERR_CONNECTION_REFUSED at http://localhost:4001', 502],
    ['net::ERR_CERT_DATE_INVALID at https://expired.badssl.com/', 502],
    ['net::ERR_SSL_PROTOCOL_ERROR at https://example.com/', 502],
    ['net::ERR_CONNECTION_TIMED_OUT at http://10.255.255.1/', 502],
    ['net::ERR_TOO_MANY_REDIRECTS at http://example.com/loop', 502],
    ['net::ERR_EMPTY_RESPONSE at http://localhost:4001', 502],
  ])('maps "%s" to %i', (message, status) => {
    const e = toTargetError(new Error(message))
    expect(statusOf(e)).toBe(status)
    expect((e as Error).message).toBe(message)
  })

  it('maps puppeteer timeouts to 504', () => {
    expect(statusOf(toTargetError(new TimeoutError('Navigation timeout of 1500 ms exceeded')))).toBe(504)
    expect(statusOf(toTargetError(new TimeoutError('Timed out after waiting 1500ms')))).toBe(504)
    expect(statusOf(toTargetError(new TimeoutError('Waiting for selector `#pdf-ready` failed')))).toBe(504)
  })

  it('leaves service failures alone', () => {
    const crash = new Error('Navigating frame was detached')
    expect(toTargetError(crash)).toBe(crash)
    const closed = new Error('Protocol error (Target.createTarget): Target closed')
    expect(toTargetError(closed)).toBe(closed)
  })

  // also how Chromium reports a failing renderer or network service, so they get a fresh browser first
  it.each([
    'net::ERR_ABORTED at https://example.com/',
    'net::ERR_FAILED at https://example.com/',
    'net::ERR_INSUFFICIENT_RESOURCES at https://example.com/',
    'net::ERR_ABORTED at ftp://example.com/x',
  ])('leaves "%s" to the retry', (message) => {
    const e = new Error(message)
    expect(toTargetError(e)).toBe(e)
  })
})

describe('toRetriedTargetError', () => {
  it('maps a net error that a fresh browser reproduced to 502', () => {
    expect(statusOf(toRetriedTargetError(new Error('net::ERR_ABORTED at ftp://example.com/x')))).toBe(502)
    expect(statusOf(toRetriedTargetError(new Error('net::ERR_FAILED at https://example.com/')))).toBe(502)
  })

  it('leaves other failures alone', () => {
    const crash = new Error('Protocol error (Page.printToPDF): Target closed')
    expect(toRetriedTargetError(crash)).toBe(crash)
    const target = new TargetError('Navigation timeout of 1500 ms exceeded', 504)
    expect(toRetriedTargetError(target)).toBe(target)
  })
})
