import puppeteer, {
  Browser,
  Page,
  PDFOptions,
  PuppeteerLifeCycleEvent,
  SetContentWaitForOptions,
  Viewport,
} from 'puppeteer'

import { acquireContext, Lease } from '~/controller/browser'
import { CaptureParameters, CaptureType } from '~/interface'
import { TargetError, toTargetError } from '~/util/target-error'
import timestamp from '~/util/timestamp'

export const defaultUrl = 'about:blank'

export const defaultNavigationTimeout = 60000

// see https://pptr.dev/api/puppeteer.pdfoptions
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
// same thresholds puppeteer uses for networkidle0/networkidle2 on navigation
const networkIdleConcurrency: Partial<Record<PuppeteerLifeCycleEvent, number>> = {
  networkidle0: 0,
  networkidle2: 2,
}

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

// loading what the caller asked for: its failures are the caller's, see ~/util/target-error
const navigate = async (when: string, process: () => Promise<unknown>): Promise<void> => {
  try {
    await logException(when, process)
  } catch (e) {
    throw toTargetError(e)
  }
}

export default async (captureType: CaptureType, params: CaptureParameters): Promise<Uint8Array> => {
  let browser: Browser | null = null
  let lease: Lease | null = null
  let failed = true
  if (!params) {
    throw new Error('Capture parameters should be defined')
  }
  const { waitForSelector } = params
  if (waitForSelector !== undefined && (typeof waitForSelector !== 'string' || !waitForSelector)) {
    throw new TargetError('waitForSelector must be a non-empty string', 400)
  }
  try {
    let page: Page
    if (debugUsingBrowserless) {
      browser = await logException(
        'puppeteer.connect',
        () => puppeteer.connect({ browserWSEndpoint: process.env.BROWSERLESS_URL }),
      )
      page = await logException('browser.newPage', () => (browser as Browser).newPage())
    } else {
      lease = await logException('browser.createBrowserContext', acquireContext)
      const { context } = lease
      page = await logException('context.newPage', () => context.newPage())
    }
    const {
      url, html, pdfOptions, viewport, screenshotOptions,
    } = params

    page.setDefaultNavigationTimeout(params.timeout || defaultNavigationTimeout)
    if (viewport || captureType === CaptureType.Screenshot) {
      await logException(
        'browser.newPage',
        () => page.setViewport({ ...defaultViewportOptions, ...viewport || {} }),
      )
    }

    // all waits for the page share the caller's timeout (the page's navigation timeout)
    const deadline = Date.now() + (params.timeout || defaultNavigationTimeout)
    // at least 1 ms: 0 would disable the timeout
    const remaining = () => Math.max(deadline - Date.now(), 1)

    if (waitForSelector) {
      // waitForSelector polls an invalid selector until the timeout, querying it once on the blank
      // page throws its SyntaxError right away, before the target is loaded
      await navigate('page.$', () => page.$(waitForSelector))
    }

    const waitUntil = params.waitUntil || (url ? defaultWaitUntil : ['load'])
    if (html) {
      // setContent does not navigate, so it only accepts lifecycle events of the document itself;
      // network idleness is awaited separately with the strictest requested threshold
      const lifecycle = waitUntil.filter(
        (event) => networkIdleConcurrency[event] === undefined,
      ) as Exclude<SetContentWaitForOptions['waitUntil'], undefined | string>
      const idle = waitUntil.map((event) => networkIdleConcurrency[event])
        .filter((concurrency): concurrency is number => concurrency !== undefined)
      // an empty list would not wait for the document at all, only an omitted one defaults to load
      await navigate('page.setContent', () => page.setContent(html, {
        waitUntil: lifecycle.length ? lifecycle : ['load'],
      }))
      if (idle.length) {
        await navigate('page.waitForNetworkIdle', () => page.waitForNetworkIdle({
          concurrency: Math.min(...idle),
          timeout: remaining(),
        }))
      }
    } else {
      await navigate('page.goto', () => page.goto(url || defaultUrl, {
        waitUntil,
      }))
    }
    if (waitForSelector) {
      // e.g. an element the page's scripts add once rendered; attached is enough, visible is not required
      await navigate('page.waitForSelector', () => page.waitForSelector(waitForSelector, {
        timeout: remaining(),
      }))
    }
    await logException(
      'page.evaluateHandle',
      () => page.evaluateHandle('document.fonts.ready'),
    )

    let buffer: Uint8Array
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
      )
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
    failed = false
    return buffer
  } catch (e) {
    // the requested page failed, the browser is fine and stays in use
    if (e instanceof TargetError) {
      failed = false
    }
    throw e
  } finally {
    // prevent zombies
    await logException('browser.close', async () => {
      if (lease) {
        await lease.release(failed)
      }
      if (browser) {
        await browser.close()
      }
    })
  }
}
