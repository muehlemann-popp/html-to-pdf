import { TargetError } from '~/util/target-error'

/**
 The `url` parameter is the only way to point the browser at a local file. Puppeteer's `page.goto()`
 is a browser-initiated navigation, which Chromium trusts: `url=file:///etc/passwd` used to print the
 container's files, mounted secrets and the Kubernetes service-account token included. Only http(s)
 pages (and the default `about:blank`) are accepted, as the README promises.

 Everything a loaded page asks for itself (images, iframes, stylesheets, `fetch`, its own navigations,
 redirects, the PDF header and footer templates) is kept away from `file:` by Chromium, not by this
 module; test/acceptance/app.test.ts pins that behaviour, see docs/features/url-restrictions.md.
 This is not an SSRF guard: any http(s) host the container can reach is still loaded.
*/
const schemes = new Set(['http:', 'https:'])

// the URL to navigate to, normalised as checked so Chromium never parses a different string than we did
export const toAllowedUrl = (url: unknown): string => {
  if (url === 'about:blank') {
    return url
  }
  if (typeof url !== 'string') {
    throw new TargetError('url must be a string', 400)
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new TargetError(`invalid URL: ${url}`, 400)
  }
  if (!schemes.has(parsed.protocol)) {
    throw new TargetError(`URL scheme ${parsed.protocol} is not allowed, only http: and https:`, 400)
  }
  return parsed.href
}
