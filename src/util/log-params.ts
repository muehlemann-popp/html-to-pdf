/**
 What is written to the log about a request. The callers' URLs can carry credentials (`user:pass@`) and
 tokens (`?token=…`, signed URLs), and a header or footer template can be as large as the 30 MB body,
 so the log gets the part of them that tells requests apart, not the whole of them. The response to the
 caller is not touched: only what goes to stdout is shortened.
*/

const truncate = (value: string, keep: number): string => (
  value.length > keep ? `${value.slice(0, keep)}… [${value.length}]` : value
)

// http(s) URL without credentials, query string and fragment ("?…" says there was one); anything else
// (about:blank, a scheme that is rejected anyway, a string that is no URL) as it is, if short
export const redactUrl = (url: string): string => {
  try {
    const { protocol, origin, pathname, search, hash } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:') {
      return `${origin}${pathname}${search ? '?…' : ''}${hash ? '#…' : ''}`
    }
  } catch {
    // not a URL, handled below
  }
  return truncate(url, 100)
}

// the same for the URLs that Chromium puts into its error messages ("net::ERR_… at https://…")
export const redactUrls = (text: string): string => text.replace(/https?:\/\/[^\s"'<>]+/g, redactUrl)

// the request parameters for the log line: `html` and any other long string cut to their start and
// length, `url` without credentials and query
export const describeParams = (params: unknown): string => JSON.stringify(params, (key, value) => {
  if (typeof value !== 'string') {
    return value
  }
  if (key === 'url') {
    return redactUrl(value)
  }
  // html is always cut (README: "too long to log"), other strings once they are long
  return truncate(value, key === 'html' ? 10 : 100)
})
