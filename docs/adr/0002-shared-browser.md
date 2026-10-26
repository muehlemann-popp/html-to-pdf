# 0002 — One shared browser with a context per request

**Date:** 2026-10-26 · **Status:** accepted · **Context:** [ADR 0001](0001-chromium-headless-shell.md),
[research](../research/2026-10-26-chromium-155-memory.md)

## Context

The service used to launch a browser per request and close it afterwards. With `--single-process`
(until Chromium 112) that was one cheap process. Chromium 155 crashes with `--single-process`, so a
per-request launch costs a browser, a GPU process, a network service and renderers, ~80 MB of
private memory and ~40 ms of startup per request even with the headless shell (ADR 0001). Under 8
concurrent requests that was ~2.7× the memory of the Chromium 112 image.

## Decision

`src/controller/browser.ts` keeps one browser per node process. Every capture creates its own
`BrowserContext` (separate cookies, storage and cache, like an incognito window), renders in it and
closes it. The browser is

- replaced after a failed capture (once its other captures finish), so the retry in
  `src/util/capture-return.ts` runs on a fresh browser;
- replaced after `BROWSER_MAX_CAPTURES` captures (default 100), so a long-lived Chromium cannot grow;
- closed after `BROWSER_IDLE_TIMEOUT_MS` without captures (default 30000), so an idle container
  returns to the memory of node alone;
- relaunched on the next capture if it crashed or disconnected.

Launch flags were also trimmed with measurements: the initial `about:blank` tab is closed (one renderer
less), the network service runs in the browser process (`NetworkServiceInProcess2`; the
`NetworkServiceInProcess` name used before has no effect on Chromium 155) and `--disable-software-rasterizer`
shrinks the unused GPU process.

## Consequences

- Memory under concurrency is back at the Chromium 112 level (8 concurrent PDFs: 265 MiB peak vs
  ~267 MiB; both images handle them under a 192 MiB limit) and latency is lower than before
  (simple PDF 43 ms vs 53 ms), because no browser is started per request.
- Captures share a browser process: a capture that crashes the browser fails the captures running
  next to it. Each of them is retried once on a fresh browser, as before.
- Only service failures replace the browser. A page that cannot be loaded (bad URL, unreachable
  site, timeout) is answered with 400/502/504 and keeps browser and process as they are. Net errors
  that a failing browser reports as well (`ERR_ABORTED`, `ERR_FAILED`, …) are retried on a fresh
  browser first and only answered with 502 if that fails the same way. Before
  this change two such failures in a row restarted the whole service, together with every request
  in flight (see the README, "Errors").
- Captures are isolated by browser context, not by process. Cookies, `localStorage` and the HTTP
  cache do not leak between requests; the service still only renders trusted content (`--no-sandbox`).
- The Browserless debug path (`BROWSERLESS=1`) still connects per request.
