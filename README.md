HTML to PDF
==========

Microservice for generating PDF and screenshots from either provided HTML or a URL.
Uses [puppeteer](https://developers.google.com/web/tools/puppeteer) and
[headless-chrome](https://chromium.googlesource.com/chromium/src/+/lkgr/headless/README.md).
Written in [typescript](https://www.typescriptlang.org/)
compiled by [webpack](https://webpack.js.org/) and
dependencies managed by [yarn 3](https://yarnpkg.com/).
Docker file is based on [`zenika/alpine-chrome`](https://github.com/Zenika/alpine-chrome)
image but it can be replaced with any other having headless chrome and [node.js](https://nodejs.org/) in it.

⚠️ Disclaimer: chrome is run with `--no-sandbox` flag meaning it should **NOT** be run as a public service.
It's only meant to be run as a microservice in your private network where you control **what** you are printing.
See [puppeteer docs](https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#setting-up-chrome-linux-sandbox) 
or [zenika/alpine-chrome](https://github.com/Zenika/alpine-chrome#3-ways-to-securely-use-chrome-headless-with-this-image)
why we have `--no-sandbox`.


## <a name="setup">Images</a>

You can find prebuilt images on [dockerhub](https://hub.docker.com/r/muehlemannpopp/html-to-pdf).


## <a name="setup">Setup</a>

Project is designed to be run as a docker container. It exposes port 4000 by default but can be configured to use
another port using `PORT` env variable. After starting container an express server will start listening at this port
providing some HTTP endpoints.

For details on running it locally please scroll to [`Development`](#development) section.


## <a name="usage">Usage</a>

### Endpoints:

- [`GET /pdf`](#pdf)
- [`GET /screenshot`](#screenshot)
- [`POST /pdf`](#pdf-post)
- [`POST /screenshot`](#screenshot-post)
- [`GET /metrics`](#metrics)
- [`GET /check`](#check)
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
    See [puppeteer docs for `page.pdf()`](https://pptr.dev/#?product=Puppeteer&show=api-pagepdfoptions)
    or [corresponding sources](https://github.com/puppeteer/puppeteer/blob/main/src/common/PDFOptions.ts)
  
  - `viewport: Viewport`, optional.
    See [puppeteer docs for `page.setViewport()`](https://pptr.dev/#?product=Puppeteer&show=api-pagesetviewportviewport)
    or [corresponding sources](https://github.com/puppeteer/puppeteer/blob/main/src/common/PuppeteerViewport.ts)
  
  - `waitUntil: string[]`, optional.
    See [puppeteer docs for `page.waitForNavigation()`](https://pptr.dev/#?product=Puppeteer&show=api-pagewaitfornavigationoptions)
  
  - `timeout: number`, optional.
    See [puppeteer docs for `page.setDefaultNavigationTimeout()`](https://pptr.dev/#?product=Puppeteer&show=api-pagesetdefaultnavigationtimeouttimeout)

  Simplest payload can be similar to:
  
  ```json
   {"url": "https://example.com"}
   ```

- <a name="screenshot-post">`POST /screenshot`</a>
  
  a POST accepting JSON body with following parameters:
  
    - `url: string`, optional. Publicly accessible url of a page to be captured.
    
    - `html: string`, optional. HTML page with all resources either embedded or referenced using absolute urls.
    
    - `screenshotOptions: ScreenshotOptions`, optional.
      See [puppeteer docs for `page.screenshot()`](https://pptr.dev/#?product=Puppeteer&show=api-pagescreenshotoptions)
      or [corresponding sources](https://github.com/puppeteer/puppeteer/blob/main/src/common/Page.ts)
      Additionally supports emulating media type via `emulateMediaType: string` optional property.
    
    - `viewport: Viewport`, optional.
      See [puppeteer docs for `page.setViewport()`](https://pptr.dev/#?product=Puppeteer&show=api-pagesetviewportviewport)
      or [corresponding sources](https://github.com/puppeteer/puppeteer/blob/main/src/common/PuppeteerViewport.ts)
    
    - `waitUntil: string[]`, optional.
      See [puppeteer docs for `page.waitForNavigation()`](https://pptr.dev/#?product=Puppeteer&show=api-pagewaitfornavigationoptions)
    
    - `timeout: number`, optional.
      See [puppeteer docs for `page.setDefaultNavigationTimeout()`](https://pptr.dev/#?product=Puppeteer&show=api-pagesetdefaultnavigationtimeouttimeout)
    
    Simplest payload is the same as for the `POST /pdf` method

- <a name="metrics">`GET /metrics`</a>
  
  Exports [prometheus](https://prometheus.io/) metrics.

- <a name="check">`GET /check`</a>
  
  Prints a dead simple test PDF file to check if the service is healthy.

- <a name="root">`GET /`</a>
  
  Prints this readme


## <a name="development">Development</a>

We are using [taskfile](https://taskfile.dev/) for running local commands. Run `task` to see a list of available commands.

You can develop locally without the need to run docker container (`task run`). Puppeteer should automatically pick up chrome
installed locally. The only requirement is to have chrome installed, but you are web developer already using chrome,
aren't you 😉.

Otherwise you can run `task run` to develop in docker container.

To run docker containers locally you need to create `deploy/docker-compose.private.yml` and add some useful env vars 
(all below are optional):
```yaml
---
version: "3.8"
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
