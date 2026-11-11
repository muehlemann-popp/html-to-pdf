import { describe, expect, it } from 'vitest'
import { describeParams, redactUrl, redactUrls } from '~/util/log-params'

describe('redactUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['https://example.com/report/42', 'https://example.com/report/42'],
    ['https://example.com:8443/a?token=secret&x=1', 'https://example.com:8443/a?…'],
    ['https://example.com/a#access_token=secret', 'https://example.com/a#…'],
    ['https://example.com/a?t=1#frag', 'https://example.com/a?…#…'],
    ['https://user:pass@example.com/a', 'https://example.com/a'],
    ['http://user@example.com/', 'http://example.com/'],
    ['about:blank', 'about:blank'],
    ['not a url', 'not a url'],
  ])('logs %s as %s', (url, expected) => {
    expect(redactUrl(url)).toBe(expected)
  })

  it('cuts what is not an http(s) URL once it is long', () => {
    const logged = redactUrl(`data:text/html,${'x'.repeat(500)}`)
    expect(logged.length).toBeLessThan(130)
    expect(logged).toMatch(/… \[\d+\]$/)
  })
})

describe('redactUrls', () => {
  it('redacts the URLs in an error message and leaves the rest', () => {
    expect(redactUrls('net::ERR_NAME_NOT_RESOLVED at https://u:p@host.invalid/a?token=s#h'))
      .toBe('net::ERR_NAME_NOT_RESOLVED at https://host.invalid/a?…#…')
    expect(redactUrls('Navigation timeout of 1500 ms exceeded')).toBe('Navigation timeout of 1500 ms exceeded')
    expect(redactUrls('two: http://a.invalid/?x=1 and "https://b.invalid/p?y=2"'))
      .toBe('two: http://a.invalid/?… and "https://b.invalid/p?…"')
  })
})

describe('describeParams', () => {
  it('cuts html to its start and length, as before', () => {
    expect(describeParams({ html: '<html>short</html>' })).toBe('{"html":"<html>shor… [18]"}')
    expect(describeParams({ html: '<p>x</p>' })).toBe('{"html":"<p>x</p>"}')
  })

  it('cuts any other long string, headerTemplate and footerTemplate included', () => {
    const logged = describeParams({
      pdfOptions: { headerTemplate: `<div>${'a'.repeat(100000)}</div>`, format: 'A4' },
    })
    expect(logged.length).toBeLessThan(200)
    expect(logged).toContain('"format":"A4"')
    expect(logged).toMatch(/"headerTemplate":"<div>a+… \[100011\]"/)
  })

  it('logs the url without credentials, query and fragment', () => {
    const logged = describeParams({ url: 'https://user:pw@example.com/doc?token=abc123#x', timeout: 5000 })
    expect(logged).toBe('{"url":"https://example.com/doc?…#…","timeout":5000}')
    expect(logged).not.toMatch(/abc123|pw/)
  })

  it('keeps everything else as it is', () => {
    expect(describeParams({ waitUntil: ['load'], viewport: { width: 800 }, waitForSelector: '#pdf-ready' }))
      .toBe('{"waitUntil":["load"],"viewport":{"width":800},"waitForSelector":"#pdf-ready"}')
    expect(describeParams({})).toBe('{}')
  })
})
