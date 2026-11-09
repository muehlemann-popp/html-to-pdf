import { describe, expect, it } from 'vitest'
import { toAllowedUrl } from '~/util/url-guard'
import { TargetError } from '~/util/target-error'

const rejection = (url: unknown): TargetError => {
  try {
    toAllowedUrl(url)
  } catch (e) {
    return e as TargetError
  }
  throw new Error(`${JSON.stringify(url)} was accepted`)
}

describe('toAllowedUrl', () => {
  it.each([
    ['http://example.com', 'http://example.com/'],
    ['https://example.com/report/42?x=1#top', 'https://example.com/report/42?x=1#top'],
    ['  https://example.com\n', 'https://example.com/'],
    ['about:blank', 'about:blank'],
  ])('accepts %j as %j', (url, expected) => {
    expect(toAllowedUrl(url)).toBe(expected)
  })

  it.each([
    'file:///etc/passwd',
    'file:///var/run/secrets/kubernetes.io/serviceaccount/token',
    'FILE:///etc/passwd',
    '\tfile:///etc/passwd',
    'file://localhost/etc/passwd',
    'view-source:file:///etc/passwd',
    'filesystem:file:///etc/passwd',
    'chrome://version',
    'devtools://devtools/bundled/inspector.html',
    'about:version',
    'data:text/html,<p>x</p>',
    'blob:https://example.com/0f1e',
    'javascript:alert(1)',
    'ftp://example.com/x',
  ])('rejects the scheme of %j with a 400', (url) => {
    const error = rejection(url)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
    expect(error.message).toMatch(/scheme .* is not allowed/)
  })

  it.each(['not a url', '/etc/passwd', 'example.com'])('rejects the relative or malformed %j as invalid', (url) => {
    const error = rejection(url)
    expect(error.status).toBe(400)
    expect(error.message).toMatch(/invalid URL/)
  })

  it.each([['https://a.example', 'file:///etc/passwd'], { href: 'file:///etc/passwd' }, 42])(
    'rejects the non-string %j',
    (url) => {
      const error = rejection(url)
      expect(error.status).toBe(400)
      expect(error.message).toBe('url must be a string')
    },
  )
})
