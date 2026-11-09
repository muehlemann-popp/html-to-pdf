# URL restrictions: no local files

The service must never print a file from its own container: its code, `/etc/passwd`, mounted
secrets, or the Kubernetes service-account token under `/var/run/secrets/`. Before this change,
`GET /pdf?url=file:///etc/passwd` did exactly that.

## Contract

- The `url` parameter (`GET` query and `POST` body of `/pdf` and `/screenshot`) accepts `http:` and
  `https:` URLs, and the default `about:blank`. Anything else is answered with `400` before a browser
  is opened, never retried: `file:` in any spelling (`FILE:`, leading whitespace, `file://localhost/`),
  `view-source:`, `filesystem:`, `chrome:`, `devtools:`, `about:` pages other than `about:blank`,
  `data:`, `blob:`, `javascript:`, `ftp:`, relative and malformed URLs, and a `url` that is not a
  string (a repeated query parameter arrives as an array).
- The browser navigates to the URL as it was checked (`new URL(url).href`), not to the string it was
  given, so Chromium never parses something different from what was allowed.
- When `html` is set, `url` is ignored, as before; it is not checked either.
- Inline content belongs in `html`. A `data:` URL in `url` used to work by accident and is now a `400`.

Implemented in `src/util/url-guard.ts` (`toAllowedUrl`), called at the top of `src/controller/capture.ts`.

## Why only the `url` parameter is checked

`page.goto()` is a browser-initiated navigation, which Chromium trusts, so it loads `file:` URLs.
Everything a page loads by itself is a renderer-initiated request from an `about:blank` or `http(s)`
document, and Chromium refuses `file:` for those on its own. Verified on 2026-11-07 against
Chromium 155.0.8059.84 (Alpine 3.24 `chromium-headless-shell`, puppeteer 25.13), with
`/app/favicon.ico` as the local file, without and with the sandbox:

| Way into a local file | Result |
| --- | --- |
| `url=file://…` (top-level `page.goto`) | **loaded** before this change, now `400` |
| `<img src="file://…">` in `html` | refused (`error` event, `naturalWidth` 0) |
| `<iframe src="file://…">`, CSS `background: url(file://…)` | refused, nothing printed |
| `fetch('file://…')` | refused (`Failed to fetch`) |
| `location.href = 'file://…'` from `about:blank` or an http page | refused, the page stays |
| http `302` to `file://…` | refused, `net::ERR_UNSAFE_REDIRECT` → `502` |
| `<img src="file://…">` in `pdfOptions.headerTemplate` | not loaded: same output as for a missing file |

Request interception (`page.setRequestInterception`) was tried as a second layer and dropped: its
handler only ever saw the top-level `file:` navigation, never the subresources above (Chromium
refuses them before interception), so it added a round trip per request and protected nothing more.

## What keeps it true

`test/acceptance/app.test.ts`, "local files cannot be printed", pins every row of the table through
the HTTP API, in all three CI modes. Each in-page check has a positive control (a `data:` image takes
the other branch or is printed), so a check cannot pass because nothing was rendered at all.

Mutation-tested: allowing `file:` in `url-guard.ts` fails the `url` tests; launching Chromium with
`--disable-web-security` (with or without `--allow-file-access-from-files`) makes a page's iframe and
navigation print local files, and fails those two tests. **Never add these flags**; `AGENTS.md` says
the same.

## What this does not do

It is not an SSRF guard. The browser still loads any `http(s)` URL, redirect or subresource the
container can reach: internal hosts, `localhost`, cloud metadata endpoints such as `169.254.169.254`.
That needs network-level egress rules, see the README.
