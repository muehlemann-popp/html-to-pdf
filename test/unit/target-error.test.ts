import { describe, expect, it } from 'vitest'
import { TimeoutError } from 'puppeteer'
import { TargetError, toTargetError } from '~/util/target-error'

// messages as Puppeteer 25 / Chromium 155 report them
const statusOf = (e: unknown) => (e instanceof TargetError ? e.status : null)

describe('toTargetError', () => {
  it.each([
    ['Protocol error (Page.navigate): Cannot navigate to invalid URL', 400],
    ['net::ERR_UNSAFE_PORT at http://127.0.0.1:1', 400],
    ['net::ERR_UNKNOWN_URL_SCHEME at foo://bar', 400],
    ['net::ERR_NAME_NOT_RESOLVED at http://does-not-exist.invalid', 502],
    ['net::ERR_CONNECTION_REFUSED at http://localhost:4001', 502],
    ['net::ERR_CERT_DATE_INVALID at https://expired.badssl.com/', 502],
    ['net::ERR_ABORTED at ftp://example.com/x', 502],
  ])('maps "%s" to %i', (message, status) => {
    const e = toTargetError(new Error(message))
    expect(statusOf(e)).toBe(status)
    expect((e as Error).message).toBe(message)
  })

  it('maps puppeteer timeouts to 504', () => {
    expect(statusOf(toTargetError(new TimeoutError('Navigation timeout of 1500 ms exceeded')))).toBe(504)
    expect(statusOf(toTargetError(new TimeoutError('Timed out after waiting 1500ms')))).toBe(504)
  })

  it('leaves service failures alone', () => {
    const crash = new Error('Navigating frame was detached')
    expect(toTargetError(crash)).toBe(crash)
    const closed = new Error('Protocol error (Target.createTarget): Target closed')
    expect(toTargetError(closed)).toBe(closed)
  })
})
