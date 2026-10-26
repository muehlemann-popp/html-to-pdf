HTML to PDF
==========

![MIT](https://img.shields.io/github/license/muehlemann-popp/html-to-pdf)
![image size](https://img.shields.io/docker/image-size/muehlemannpopp/html-to-pdf)
![version](https://img.shields.io/docker/v/muehlemannpopp/html-to-pdf/latest)

Microservice for generating PDF and screenshots from either provided HTML or a URL.
Uses [puppeteer](https://pptr.dev/) and
[headless Chromium](https://developer.chrome.com/docs/chromium/headless).
Written in [typescript](https://www.typescriptlang.org/)
compiled by [webpack](https://webpack.js.org/) and
dependencies managed by [yarn 4](https://yarnpkg.com/).

The image runs Node 24 and the Chromium package of its Alpine release (currently Alpine 3.24,
Chromium 155), driven by the puppeteer release that targets the same Chromium major.

⚠️ Disclaimer: chrome is run with `--no-sandbox` flag meaning it should **NOT** be run as a public service.
It's only meant to be run as a microservice in your private network where you control **what** you are printing.
See [puppeteer docs](https://pptr.dev/troubleshooting#setting-up-chrome-linux-sandbox)
or [zenika/alpine-chrome](https://github.com/Zenika/alpine-chrome#3-ways-to-securely-use-chrome-headless-with-this-image)
why we have `--no-sandbox`.


## <a name="images">Docker Images</a>

You can find prebuilt docker images on [dockerhub](https://hub.docker.com/r/muehlemannpopp/html-to-pdf). Each tag on 
github should have corresponding docker image tag on dockerhub. For each commit to `main` branch a corresponding tag 
starting with `git-` prefix is created. This can be used if you want to use some latest version that was not yet released.


## <a name="setup">Setup</a>

Project is designed to be run as a docker container. It exposes port 4000 by default but can be configured to use
another port using `PORT` env variable. After starting container an express server will start listening at this port
providing some HTTP endpoints.

For details on running it locally please scroll to [`Development`](#development) section.

### Resources

One headless Chromium serves all requests, each request in its own browser context (separate
cookies, storage and cache). Measured on arm64 (see
[docs/research](docs/research/2026-10-26-chromium-155-memory.md)): ~25 MiB idle, ~80–120 MiB for one
request at a time, ~265 MiB peak for 8 concurrent requests, which also run fine under a 192 MiB
container limit. When rendering fails twice in a row the node process exits and the entrypoint
restarts it; pages that cannot be loaded do not count, see [Errors](#errors).

Optional environment variables:

- `PORT`, default `4000`.
- `BROWSER_MAX_CAPTURES`, default `100`: the browser is replaced after this many captures.
- `BROWSER_IDLE_TIMEOUT_MS`, default `30000`: the browser is closed after this long without requests
  and started again by the next one.
- `SENTRY_DSN`, `ENV`, `RELEASE_ID`: error reporting to Sentry.


## <a name="usage">Usage</a>

### Endpoints:

- [`GET /pdf`](#pdf)
- [`GET /screenshot`](#screenshot)
- [`POST /pdf`](#pdf-post)
- [`POST /screenshot`](#screenshot-post)
- [`GET /metrics`](#metrics)
- [`GET /health`](#health)
- [`GET /selfcheck`](#selfcheck)
- [`GET /version`](#version)
- [`GET /`](#root)

Note: only `POST` methods allow passing `html` instead of an `url`. Both `url` and `html` are optional meaning if none
is provided `about:blank` will be printed.

### Endpoints Details:

- <a name="pdf">`GET /pdf?url=<url>&filename=<filename>`</a>
  
  accepts the following query parameters:
  
  - `url: string`, required
  
  - `filename: string`, optional.
  
  Simplest query can be similar to: `/pdf?url=https://example.com`
  
- <a name="screenshot">`GET /screenshot?url=<url>&filename=<filename>`</a>
  
  accepts the following query parameters:
  
  - `url: string`, required
  
  - `filename: string`, optional.
  
  Simplest query can be similar to: `/screenshot?url=https://example.com`
  
- <a name="pdf-post">`POST /pdf`</a>
  
  a POST accepting JSON body with following parameters:
  
  - `url: string`, optional. Publicly accessible url of a page to be captured.
  
  - `html: string`, optional. HTML page with all resources either embedded or referenced using absolute urls.
  
  - `pdfOptions: PDFOptions`, optional.
    See [puppeteer docs for `PDFOptions`](https://pptr.dev/api/puppeteer.pdfoptions)
  
  - `viewport: Viewport`, optional.
    See [puppeteer docs for `Viewport`](https://pptr.dev/api/puppeteer.viewport)
  
  - `waitUntil: string[]`, optional. Any of `load`, `domcontentloaded`, `networkidle0`, `networkidle2`,
    see [puppeteer docs for `PuppeteerLifeCycleEvent`](https://pptr.dev/api/puppeteer.puppeteerlifecycleevent).
    Defaults to all four for `url` and to `load` for `html`. For `html`, `networkidle0` / `networkidle2`
    are awaited after the content is set (no connections / at most 2 for 500 ms).
  
  - `timeout: number`, optional, milliseconds, defaults to 60000.
    See [puppeteer docs for `page.setDefaultNavigationTimeout()`](https://pptr.dev/api/puppeteer.page.setdefaultnavigationtimeout)

  Simplest payload can be similar to:
  
  ```json
   {"url": "https://example.com"}
   ```

- <a name="screenshot-post">`POST /screenshot`</a>
  
  a POST accepting JSON body with following parameters:
  
    - `url: string`, optional. Publicly accessible url of a page to be captured.
    
    - `html: string`, optional. HTML page with all resources either embedded or referenced using absolute urls.
    
    - `screenshotOptions: ScreenshotOptions`, optional.
      See [puppeteer docs for `ScreenshotOptions`](https://pptr.dev/api/puppeteer.screenshotoptions).
      Additionally supports emulating media type via `emulateMediaType: string` optional property.
    
    - `viewport: Viewport`, optional, defaults to 1200×800.
      See [puppeteer docs for `Viewport`](https://pptr.dev/api/puppeteer.viewport)
    
    - `waitUntil: string[]` and `timeout: number`, optional, same as for [`POST /pdf`](#pdf-post).
    
    Simplest payload is the same as for the `POST /pdf` method

- <a name="metrics">`GET /metrics`</a>
  
  Exports [prometheus](https://prometheus.io/) metrics.

- <a name="health">`GET /health`</a>

  Liveness check, returns `{"status": "ok"}` until the service hit an error it cannot recover from
  (it then exits and the container entrypoint restarts it).

- <a name="selfcheck">`GET /selfcheck`</a>

  Readiness check: prints a dead simple test PDF and verifies it is a PDF written by Chromium
  (`%PDF-1.x` header, `/Producer (Skia/PDF …)`, `%%EOF` trailer). Returns `{"status": "ok"}` or a 500.

- <a name="version">`GET /version`</a>

  Returns the `RELEASE_ID`, `CI_BUILD_DATE` and `ENV` environment variables of the container.

- <a name="root">`GET /`</a>
  
  Prints this readme

### <a name="errors">Errors</a>

`/pdf` and `/screenshot` answer failures with JSON `{"status": "error", "message": "…"}` and a
status that says whose problem it is:

| Status | Cause | Service |
| --- | --- | --- |
| `400` | The URL cannot be loaded at all: malformed, blocked port or unsupported scheme (`net::ERR_UNSAFE_PORT`, `Cannot navigate to invalid URL`, …) | keeps running |
| `502` | The requested site failed: DNS, refused connection, TLS, aborted (`net::ERR_NAME_NOT_RESOLVED`, `net::ERR_CERT_…`, …) | keeps running |
| `504` | The page did not finish loading within `timeout`, including `networkidle0`/`networkidle2` | keeps running |
| `500` | The service failed to render (e.g. Chromium crashed) | retried once on a fresh browser; if the retry fails too, the process exits and the container entrypoint restarts it |

`400`, `502` and `504` are not retried and not reported to Sentry.


## <a name="development">Development</a>

We are using [taskfile](https://taskfile.dev/) for running local commands. Run `task` to see a list of available commands.

You can develop locally without the need to run docker container (`task start:local`). Node 24 is
required (`.nvmrc`). Puppeteer does not download a browser (install scripts are disabled in
`.yarnrc.yml`), so point it at a locally installed Chrome or Chromium, e.g. on macOS:

```bash
export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

A local Chrome is usually a different major than the one in the image, so check rendering changes in
docker. Otherwise you can run `task run` to develop in docker container, and `task test` runs the
test suite in the docker `test` image, as CI does.

Dependencies are only installed in versions published at least two weeks ago (`npmMinimalAgeGate`
in `.yarnrc.yml`).

To run docker containers locally you need to create `deploy/docker-compose.private.yml` and add some useful env vars 
(all below are optional):
```yaml
---
services:
  printer:
    environment:
      - SENTRY_DSN=<YOUR_SENTRY_DSN>
      - BROWSERLESS=1
```

If you provide `SENTRY_DSN` all errors from local env will be reported to sentry.

You can run `task run:debug` which will start useful 
[browserless/chrome](https://github.com/browserless/chrome) image. If you provide `BROWSERLESS=1` in your 
docker compose file printer will start using browserless container instead of bundled chrome.
When using browserless you can also do nice debugging at [localhost:3000](http://localhost:3000/). Note in such case 
chrome versions used in browserless and html-to-pdf itself may diverge.
