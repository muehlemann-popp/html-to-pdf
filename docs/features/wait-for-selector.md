# Waiting for a selector

Issue: [#10](https://github.com/muehlemann-popp/html-to-pdf/issues/10)

Callers that print pages rendered by JavaScript (single-page apps in React, Vue, Angular, Svelte, …,
or plain scripts) need the page captured once it has rendered, which happens after `load` and is not
tied to network idleness. The optional request parameter `waitForSelector` lets them name an element
the page adds when it is done; the capture waits until it is attached to the page. Nothing in the
service is specific to a framework or to a name: `#pdf-ready`, used in the examples and tests, is
only a convention the caller's page and request agree on. The user-facing contract is in the top-level
`README.md` (`POST /pdf` parameters and "Errors").

## Contract

- `POST /pdf` and `POST /screenshot` take it in the JSON body, `GET /pdf` and `GET /screenshot` as a
  query parameter. Without it a request behaves exactly as before: no extra calls on the page.
- It must be a non-empty string; anything else is a `400` before a browser context is acquired.
- The element only has to be attached (puppeteer's default for `waitForSelector`), not visible, so a
  `hidden` marker works.
- Any selector `page.waitForSelector` accepts works, including puppeteer's `::-p-…` extensions and the
  `xpath/`, `text/`, `aria/`, `pierce/` prefixes.

## How it works (`src/controller/capture.ts`)

1. **Syntax check before loading.** `page.$(selector)` runs once on the fresh, blank page. Puppeteer
   25's `page.waitForSelector` does not reject an invalid selector: it keeps polling and fails with
   a `TimeoutError` after the whole `timeout`, which would make a typo look like a slow page (`504`
   after a minute by default). `page.$` throws the browser's `SyntaxError` at once
   (`SyntaxError: Failed to execute 'querySelector' on 'Document': '#' is not a valid selector.`, or
   `'evaluate'` for XPath). `toTargetError` (`src/util/target-error.ts`) maps that message to a `400`
   `TargetError`, so it is neither retried nor treated as a broken browser. Unknown `::-p-…` pseudo
   elements are not syntax errors for puppeteer, they never match and end in a `504`.
2. **Load** the page as before: `page.setContent` (+ `waitForNetworkIdle` when asked for) for
   `html`, `page.goto` for `url`, both with `waitUntil`.
3. **Wait** with `page.waitForSelector(selector, { timeout })`, before `document.fonts.ready` and the
   capture.

All waits share one deadline, computed from the caller's `timeout` (default
`defaultNavigationTimeout`, 60 s) before loading starts. `waitForNetworkIdle` and `waitForSelector`
each get only what is left of it, at least 1 ms because puppeteer reads `0` as "no timeout". A page
that takes the whole timeout to load therefore fails the selector wait right away instead of
doubling the time a request can take.

Both the syntax check and the wait go through `navigate(...)`, so their failures go through
`toTargetError`: a timeout becomes a `504`, an invalid selector a `400`. A selector that is wrong is
the caller's problem, so the browser and the process keep running (see the error split in
`AGENTS.md`). Anything else they throw (e.g. the target closed) stays a service failure, with the
usual retry.

## Tests

- `test/unit/capture.capture.test.ts`: call order (check → load → wait → fonts), the shared
  deadline, type validation and the `400` before loading.
- `test/unit/target-error.test.ts`: the `SyntaxError` messages map to `400`, the selector timeout to
  `504`.
- `test/acceptance/app.test.ts`: a page whose script replaces its content after 1.5 s with a
  three-page layout and `#pdf-ready`. Printed without the parameter it has one page; with it, three,
  for `html`, `url` and `GET /pdf`. The caller-error table covers the `504` and the `400`s, followed by the
  check that the service keeps serving.

Not in scope: waiting for a JavaScript expression (`waitForFunction`), a fixed delay, or visibility
options.
