# Capture limits: concurrency, queue and timeout cap

Every capture holds a browser context and at least one renderer process until it is done. Before
this limit every request opened one immediately, so a burst of requests could open dozens at once and
run the container out of memory. The memory figures this is sized on come from
[ADR 0002](../adr/0002-shared-browser.md) and the
[Chromium 155 research](../research/2026-10-26-chromium-155-memory.md): ~80–120 MiB for one request,
~265 MiB peak for 8 concurrent PDFs. The user-facing contract is in the top-level `README.md`
(environment variables, `timeout`, "Errors").

## Contract

- At most `MAX_CONCURRENT_CAPTURES` captures (default 8) render at the same time in one node process.
- Up to `MAX_QUEUED_CAPTURES` more (default 32, `0` allowed) wait for a slot and start in arrival
  order (FIFO).
- A request that finds all slots busy and the queue full is answered at once with
  `503 {"status": "error", "message": "too many captures: …"}` and `Retry-After: 1`.
- That `503` is neither a `TargetError` nor a service failure: it is not retried, not reported to
  Sentry, and does not replace the browser or exit the process. It is logged as a warning.
- A capture and its retry on a fresh browser (README, "Errors") share one slot: the retry does not
  queue again.
- A client that closes the connection while its capture is queued gives up its place; the capture
  never starts. A capture that has started runs to the end.
- **Queue time does not count against `timeout`.** `timeout` stays the time the page has to load,
  as documented before, so the same request gets the same result whether the service is busy or not,
  and a slow queue is never reported as a `504` page timeout. Waiting is bounded anyway: the queue
  has at most `MAX_QUEUED_CAPTURES` entries and each capture ahead takes at most `MAX_TIMEOUT_MS`
  (plus rendering). Callers that need an overall deadline set it on their HTTP client; if they give
  up while queued, the capture is dropped (see above).
- `timeout` is capped by `MAX_TIMEOUT_MS` (default 120000): **a larger value is lowered to it**, not
  rejected, so callers that ask for more than they need keep working, and no request can hold a
  browser context for longer. `0` or no `timeout` still means 60000 (or `MAX_TIMEOUT_MS` if that is
  lower). A `timeout` that is not a non-negative number (a string, a negative number) is a `400`,
  checked before a browser context is acquired; before, a string turned the shared deadline into a
  string concatenation.
- **A capture can take up to twice `timeout`.** Loading (navigation, `waitUntil`, `waitForSelector`)
  shares the first budget; fonts and printing or capturing get a second one of the same size, so
  loading that used all of the first does not leave the print 1 ms. puppeteer limits `page.pdf` to
  30 s on its own, not to the navigation timeout, lets `pdfOptions.timeout: 0` lift even that, and
  has no limit for a screenshot or for evaluating in the page except its 180 s protocol timeout, so
  `capture()` passes the second budget to `page.pdf` (overriding the caller's `pdfOptions.timeout`)
  and races the screenshot and `document.fonts.ready` against it. That bounds a request to
  `2 × MAX_TIMEOUT_MS`. A timeout there is not a `TargetError` at first, since a hung browser looks
  the same: it takes the retry on a fresh browser, and only a second one becomes a `504`
  (`toRetriedTargetError`).
- Invalid values of the three variables (not an integer, below their minimum of 1, 0 and 1) fall
  back to the default, like `BROWSER_MAX_CAPTURES`.

## `/selfcheck` takes no slot

`/selfcheck` is the readiness probe of every deployment and calls `capture()` directly, without a
slot. Readiness answers "can this instance render?", not "is it busy?": if it queued, a busy instance
would fail its probe as soon as waiting took longer than the probe's timeout, and with a full queue
it would get a `503`. Kubernetes would then take busy pods out of the service, the remaining pods
would get their traffic and fail too, until no pod is ready. What `/selfcheck` asserts is unchanged
(AGENTS.md). The cost is at most one extra tiny capture (a one-line HTML page) per probe on top of the
limit.

## How it works

- `src/controller/capture-slots.ts`: `createCaptureSlots(maxActive, maxQueued)` returns `run(task,
  signal)`, which waits for a slot (or rejects with `CaptureRejectedError`), runs the task and frees
  the slot in `finally`, so a failing task always releases it. A freed slot goes straight to the next
  waiter. `captureSlots` is the instance configured from the environment.
- `src/util/capture-return.ts` (`/pdf` and `/screenshot`) runs the capture and its retry inside one
  `captureSlots.run`; the `AbortSignal` fires when the response is closed before it finished.
- `src/util/log-request.ts` answers `CaptureRejectedError` with `503` and `Retry-After`.
- `src/controller/capture.ts` computes the navigation timeout (`navigationTimeout`) before acquiring
  a browser context.

## Tests

- `test/unit/capture-slots.test.ts`: limit, FIFO order, `503` when full, `MAX_QUEUED_CAPTURES=0`,
  release on error, a client hanging up while queued.
- `test/unit/capture.capture.test.ts`: the timeout cap and invalid timeouts.
- `test/acceptance/capture-limits.test.ts`: with one slot and no queue, a second request gets `503`
  with `Retry-After` while `/selfcheck` still answers `200`; a requested 60 s timeout is lowered to
  `MAX_TIMEOUT_MS` (1.5 s there), and the slot is free again after that `504`.
