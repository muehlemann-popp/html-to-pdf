# Chromium 155: memory, latency and rendering vs Chromium 112

**Date:** 2026-10-26 · **Read against:** `main` (`4e3b4b6`) and branch `feat/chromium-155` ·
**Context:** [dependency upgrade plan](../plans/dependency-upgrade.md), A1/A5 ·
**Decisions taken from it:** [ADR 0001](../adr/0001-chromium-headless-shell.md),
[ADR 0002](../adr/0002-shared-browser.md)

## Question

What does moving the image from Chromium 112 (Node 19, Puppeteer 19, Alpine 3.17) to Chromium 155
(Node 24, Puppeteer 25, Alpine 3.24) cost in memory and latency, and does the output still look the
same?

## Method

`scripts/benchmark.mjs` starts a fresh container per scenario, replays the requests in
`test/reference/requests/` and reads the container cgroup (`memory.peak`, `memory.current`) plus
`anon` from `memory.stat` sampled every 200 ms. Ten sequential requests per scenario (five for
`long`), `parallel8` is three rounds of eight concurrent simple PDFs. No memory limit.
`scripts/compare-references.mjs` compares the first saved output of each fixture.

Host: Apple Silicon (arm64), OrbStack, Linux 7.2 kernel, 18 CPUs; all images native arm64.
Baseline image: `muehlemannpopp/html-to-pdf:git-4e3b4b6` from Docker Hub (the build of current
`main`, which no longer builds from source — see the plan).

**Caveat on `selfcheck`:** it is the first scenario that starts a browser, so its cgroup is
charged the page cache for reading the ~200 MiB Chromium files; later containers find those pages
cached by the host. That cache is reclaimable, but a real container pays it once after start.

## Results

Peak memory (MiB, `memory.peak`) / median latency (ms):

| Variant | selfcheck | simple | rich | long (60 p) | screenshot | parallel8 |
| --- | --- | --- | --- | --- | --- | --- |
| A0 Chromium 112, `--single-process` (baseline) | 121 / 55 | 62 / 57 | 145 / 804 | 123 / 126 | 86 / 148 | 269 / 111 |
| A Chromium 155 full browser, new headless | 305 / 201 | 297 / 207 | 350 / 1093 | 332 / 277 | 225 / 233 | 1765 / 568 |
| B Chromium 155 headless shell | 349 / 87 | 120 / 78 | 147 / 806 | 150 / 162 | 133 / 148 | 731 / 179 |
| C as A + `--in-process-gpu --renderer-process-limit=1` | 359 / 182 | 237 / 204 | 403 / 1079 | 285 / 280 | 165 / 231 | 1273 / 452 |
| D as B + the flags of C | crashes at launch | | | | | |
| B, per-request browser, before the shared browser | 118 / 79 | 120 / 82 | 136 / 800 | 149 / 154 | 134 / 150 | 731 / 190 |

All variants above still launch one browser per request. The image on the branch shares one browser
between requests; its numbers are in [Closing the gap](#closing-the-gap-shared-browser-and-trimmed-flags)
(8 concurrent PDFs: 265 MiB instead of 731 MiB).

The final image is 1.22 GB (baseline 1.42 GB): it carries `chromium-headless-shell` instead of
`chromium` and no longer the compiler toolchain for native addons.

No request failed and no Chromium process was left behind in any variant that launched. `rich`
latency is dominated by fetching the web font.

Where the memory goes in variant A, one request (private/anonymous memory per process): browser
36 MB, network service 20 MB, storage service 18 MB, GPU process 20 MB, three renderers 80 MB —
about 175 MB that `--single-process` used to fold into one process. `--single-process` is not an
option any more: Chromium 155 aborts with `Trace/breakpoint trap`, in both builds.

### Rendering

Same page count and page size for every reference in A and B. Share of pixels differing from the
baseline (50 dpi grayscale, threshold 32/255), identical for A and B:

| Reference | Pages | Differing pixels |
| --- | --- | --- |
| `simple` | 1 (Letter) | 0.3% |
| `rich` (web font, CJK, emoji, `@page` A4, page break) | 2 (A4) | p1 3.2%, p2 0.5% |
| `long` | 60 (A4) | p1 13.0%, p30 1.2%, p60 1.2% |
| `screenshot` | 1200×800 PNG | size identical (not pixel-compared) |

Inspected side by side, the differences are anti-aliasing and sub-pixel glyph positions on dense
text (hence 13% on a text-only page at this threshold); layout, line breaks and page breaks are the
same. The one visible change is the 👩‍💻 emoji, which comes from a newer Noto Color Emoji release.

### PDF format

All builds still write `%PDF-1.4` and `/Producer (Skia/PDF m<major>)`. The full browser writes its
user agent into `/Creator` (`Mozilla/5.0 … HeadlessChrome/155.0.0.0 …`), the headless shell writes
`/Creator (Chromium)`; Chromium 155 ends the file with `%%EOF\n` where 112 ended with `%%EOF`.

## Closing the gap: shared browser and trimmed flags

Even with the headless shell a per-request launch costs ~80 MB of private memory in 5 processes
(browser 16, GPU 19, network service 11, two renderers 33). Measured one change at a time (one
request held open, sum of `RssAnon` of all Chromium processes):

| Change | Chromium private memory |
| --- | --- |
| none (headless shell) | 80 MB |
| reuse/close the initial `about:blank` tab | 61 MB (one renderer less) |
| `--enable-features=NetworkServiceInProcess2` | 69 MB (no network process; the old `NetworkServiceInProcess` name has no effect) |
| `--disable-software-rasterizer` | 76 MB (GPU process 19 → 14) |
| `--renderer-process-limit=1` | 64 MB (same renderer as the tab change, not additive) |
| `--disable-features=…,SpareRendererForSitePerProcess` | 80 MB (no effect) |
| `--in-process-gpu`, `--use-angle=swiftshader-webgl` | crash at launch / no effect |

The flags help a single request; what scales is not launching per request at all:
[ADR 0002](../adr/0002-shared-browser.md) keeps one browser and gives each request its own browser
context. Benchmark of the resulting image (anonymous peak sampled every 50 ms):

| | Chromium 112 | **Chromium 155, shared browser** |
| --- | --- | --- |
| simple PDF, peak / anon / median | 62–135 / 51 MiB / 53 ms | 90 / 78 MiB / 43 ms |
| long (60 p), peak / median | 98–123 MiB / 126–134 ms | 118 MiB / 103 ms |
| screenshot, peak / median | 83–86 MiB / 136–148 ms | 101 MiB / 101 ms |
| 8 concurrent, peak / anon / median | 266–269 / 207 MiB / 104 ms | 265 / 235 MiB / 84 ms |
| 8 concurrent under `--memory=192m` | 0 failures | 0 failures |
| 300 sequential, anon peak | 103 MiB | 93 MiB |

(Ranges for Chromium 112 are the two runs of the day; `memory.peak` varies by up to 2× with how
much page cache a container is charged, which is why the limit test is the more honest number.)
Reference outputs are unchanged by the flags (same pixel diffs as above). 250 sequential captures
launched exactly three browsers (`BROWSER_MAX_CAPTURES=100`).

## Verdict

Moving to Chromium 155 is unavoidable (`main` no longer builds, Chromium 112 is three years old)
and safe for output. Launching the full browser per request would cost ~5× memory and ~3.5×
latency; the headless shell (ADR 0001) halves that, and the shared browser (ADR 0002) brings memory
under concurrency back to the Chromium 112 level while being ~20% faster than it.

Not verified: amd64 (the release also builds `linux/amd64` under QEMU in CI), memory limits below
192 MiB, and long-running stability beyond a few hundred requests per container.
