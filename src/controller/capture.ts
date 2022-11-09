import puppeteer, {
  Browser,
  Page,
  PDFOptions,
  PuppeteerLifeCycleEvent,
  Viewport,
} from 'puppeteer'

import Buffer from 'buffer'
import { CaptureParameters, CaptureType } from '~/interface'
import timestamp from '~/util/timestamp'

export const defaultUrl = 'about:blank'

export const defaultNavigationTimeout = 60000

// see https://pptr.dev/#?product=Puppeteer&version=v9.1.0&show=api-pagepdfoptions
const defaultPDFOptions: PDFOptions = {
  printBackground: true,
  preferCSSPageSize: true,
  margin: {
    top: '0',
    right: '0',
    bottom: '0',
    left: '0',
  },
}

// some common notebook screen resolution, please override
export const defaultViewportOptions: Viewport = {
  width: 1200,
  height: 800,
}

const debugUsingBrowserless = process.env.BROWSERLESS === '1'
const defaultWaitUntil: PuppeteerLifeCycleEvent[] = ['domcontentloaded', 'load', 'networkidle2', 'networkidle0']

export const logException = async <T> (when: string, process: () => Promise<T>): Promise<T> => {
  try {
    return await process()
  } catch (e) {
    const err = e as Error
    // eslint-disable-next-line no-console
    console.error(`[${timestamp()}] Exception at ${when}: "${err.message}"`)
    // catching errors to sentry is done at higher level, exception stack logging as well
    throw err
  }
}

/**
 We trust the content we open in Chrome, so we can launch Chrome with the --no-sandbox argument.
 Generally running without a sandbox is strongly discouraged. Consider configuring a sandbox instead!
 @see: https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md
*/
export default async (captureType: CaptureType, params: CaptureParameters): Promise<Buffer> => {
  let browser: Browser | null = null
  if (!params) {
    throw new Error('Capture parameters should be defined')
  }
  try {
    if (debugUsingBrowserless) {
      browser = await logException(
        'puppeteer.connect',
        () => puppeteer.connect({ browserWSEndpoint: process.env.BROWSERLESS_URL }),
      )
    } else {
      browser = await logException('puppeteer.launch', () => puppeteer.launch({
        headless: true, // we want to run headless chrome
        // We try to solve issues with google chrome sometimes stopping to work
        // As suggested here we try to use pipe instead of websocket: https://github.com/puppeteer/puppeteer/issues/2735
        // pipe: true,
        args: [
          '--disable-accelerated-2d-canvas',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-component-extensions-with-background-pages',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-features=TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process',
          '--disable-gpu',
          '--disable-infobars',
          '--disable-ipc-flooding-protection',
          '--disable-notifications',
          '--disable-setuid-sandbox',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          '--font-render-hinting=none',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-first-run',
          '--no-sandbox', // see above
          '--no-zygote', // this together with single process adds about 30% of speed
          '--safebrowsing-disable-auto-update',
          '--single-process',
        ],
      }))
    }
    const {
      url, html, pdfOptions, viewport, screenshotOptions,
    } = params

    const page: Page = await logException('browser.newPage', () => (browser as Browser).newPage())
    page.setDefaultNavigationTimeout(params.timeout || defaultNavigationTimeout)
    if (viewport || captureType === CaptureType.Screenshot) {
      await logException(
        'browser.newPage',
        () => page.setViewport({ ...defaultViewportOptions, ...viewport || {} }),
      )
    }

    const waitUntil = params.waitUntil || (url ? defaultWaitUntil : ['load'])
    if (html) {
      const loaded = logException('page.waitForNavigation', () => page.waitForNavigation({
        waitUntil,
      }))

      await logException('page.setContent', () => page.setContent(html))
      await loaded
    } else {
      await logException('page.goto', () => page.goto(url || defaultUrl, {
        waitUntil,
      }))
    }
    await logException(
      'page.evaluateHandle',
      () => page.evaluateHandle('document.fonts.ready'),
    )

    let buffer: Buffer
    if (captureType === CaptureType.Screenshot) {
      if (screenshotOptions?.emulateMediaType) {
        await logException(
          'page.emulateMediaType',
          () => page.emulateMediaType(screenshotOptions.emulateMediaType),
        )
      }
      // never save files to disk locally
      if (screenshotOptions?.path) {
        delete screenshotOptions.path
      }
      buffer = await logException(
        'page.screenshot',
        () => page.screenshot({ ...screenshotOptions || {}, encoding: 'binary' }),
      ) as Buffer
    } else {
      // never save files to disk locally
      if (pdfOptions?.path) {
        delete pdfOptions.path
      }
      buffer = await logException(
        'page.pdf',
        () => page.pdf({ ...defaultPDFOptions, ...pdfOptions || {} }),
      )
    }
    await logException('page.close', () => page.close())
    return buffer
  } finally {
    // prevent zombies
    await logException('browser.close', async () => {
      if (browser) {
        await browser.close()
      }
    })
  }
}
