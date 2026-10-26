# 0001 — Render with chrome-headless-shell, not the full Chromium browser

**Date:** 2026-10-26 · **Status:** accepted · **Context:** [dependency upgrade plan](../plans/dependency-upgrade.md), step A5

## Context

Until Chromium 112 the image ran Alpine's `chromium` package with `--single-process --no-zygote`:
one browser process per request, ~60 MiB peak for a simple PDF, ~270 MiB for 8 concurrent requests.

Chromium 155 crashes on startup with `--single-process` (`Trace/breakpoint trap`), so every request
now starts a browser, a GPU process, network and storage services and up to three renderers. With
the full browser in new-headless mode that costs ~300 MiB per request and 1.7 GiB for 8 concurrent
requests, at 3.5× the latency. Old headless no longer exists in the full browser; it lives on as the
separate `chrome-headless-shell` build, which Alpine ships as `chromium-headless-shell` for the same
Chromium version.

## Decision

The image installs `chromium-headless-shell` instead of `chromium`, `PUPPETEER_EXECUTABLE_PATH`
points at `/usr/bin/chromium-headless-shell` and `puppeteer.launch()` uses `headless: 'shell'`.

Measured on the same image and flags ([research](../research/2026-10-26-chromium-155-memory.md)):
the headless shell renders the reference documents identically to the full browser (same Skia PDF
writer, same page count, size and pixel diff against Chromium 112), at about half the peak memory
and about 2.5× lower latency.

## Consequences

- Peak memory per concurrent request is ~100 MiB instead of ~200–300 MiB. [ADR 0002](0002-shared-browser.md)
  then shares one browser between requests, which brings concurrency back to the Chromium 112 level.
- The headless shell has no new-headless-only features (extensions, full browser UI APIs). None of
  them matter for `page.pdf()` / `page.screenshot()`.
- `--in-process-gpu` crashes the headless shell at launch. `--renderer-process-limit=1` works but
  saves nothing once the initial tab is closed (ADR 0002).
- Local development with a regular Chrome binary still works: `headless: 'shell'` passes plain
  `--headless`, which is new headless in Chrome ≥ 132. Rendering checks belong in the image.
- chrome-headless-shell is a separate upstream build that puppeteer supports first-class
  (`headless: 'shell'`). If Alpine ever stops packaging it, the fallback is `chromium` with
  `headless: true` and the memory numbers above.
