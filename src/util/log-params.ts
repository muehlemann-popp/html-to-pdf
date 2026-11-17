/**
 What is written to the log about a request. The callers' URLs can carry credentials (`user:pass@`) and
 tokens (`?token=…`, signed URLs), and a header or footer template can be as large as the 30 MB body,
 so the log gets the part of them that tells requests apart, not the whole of them. The response to the
 caller is not touched: only what goes to stdout is shortened.
*/

// the start of a long value and its length (of the value as sent, when `value` was redacted from it)
const truncate = (value: string, keep: number, length = value.length): string => (
  value.length > keep ? `${value.slice(0, keep)}… [${length}]` : value
)

// "scheme://", where credentials can follow
const withAuthority = /^[a-z][a-z\d+.-]*:\/\//i

// a URL that `new URL()` rejects or that is not http(s), e.g. "https://user:pa ss@host/?token=…" or
// "ftp://user:pass@host": cut by its text, so the secrets go even when it cannot be parsed. Everything up
// to the last "@" before the query is taken for credentials, which may take a path with an "@" too
const redactUnparsed = (url: string): string => {
  const [, scheme, rest] = /^([a-z][a-z\d+.-]*:\/\/)(.*)$/is.exec(url) ?? []
  const withoutCredentials = rest.replace(/^[^?#]*@/, '')
  const cut = withoutCredentials.search(/[?#]/)
  return `${scheme}${cut < 0 ? withoutCredentials : `${withoutCredentials.slice(0, cut)}${withoutCredentials[cut]}…`}`
}

// a URL without credentials, query string and fragment ("?…" says there was one); a string that is no
// URL with an authority (about:blank, data:…, any other text) as it is, if short
export const redactUrl = (url: string): string => {
  try {
    const {
      protocol, origin, pathname, search, hash,
    } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:') {
      return `${origin}${pathname}${search ? '?…' : ''}${hash ? '#…' : ''}`
    }
  } catch {
    // not a URL, handled below
  }
  return truncate(withAuthority.test(url) ? redactUnparsed(url) : url, 100)
}

// the same for the URLs in a text, e.g. those Chromium puts into its error messages
// ("net::ERR_… at https://…") or a header template
export const redactUrls = (text: string): string => text.replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi, redactUrl)

// the request parameters for the log line: `url` without credentials and query, URLs in any other
// string as well (a repeated `?url=` is an array, a template can contain them), then `html` and any
// other long string cut to their start and length
export const describeParams = (params: unknown): string => JSON.stringify(params, (key, value) => {
  if (typeof value !== 'string') {
    return value
  }
  if (key === 'url') {
    return redactUrl(value)
  }
  // html is always cut to 10 characters (README: "too long to log"), not worth searching for URLs
  if (key === 'html') {
    return truncate(value, 10)
  }
  // redacted before it is cut: a cut could leave the credentials of a URL without the "@" that marks them
  return truncate(redactUrls(value), 100, value.length)
})
