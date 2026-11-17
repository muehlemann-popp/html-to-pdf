import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'
import puppeteer, { TimeoutError } from 'puppeteer'
import { closeBrowser } from '~/controller/browser'
import capture, { defaultViewportOptions } from '~/controller/capture'
import { CaptureType } from '~/interface'
import { CaptureTimeoutError, TargetError } from '~/util/target-error'

// vi.mock is hoisted above the imports, so everything its factory uses has to be hoisted too
const { pageProto, contextProto, browserProto } = vi.hoisted(() => {
  const nil = null
  const page = {
    setContent: vi.fn().mockResolvedValue(nil),
    setDefaultNavigationTimeout: vi.fn().mockResolvedValue(nil),
    goto: vi.fn().mockResolvedValue(nil),
    waitForNetworkIdle: vi.fn().mockResolvedValue(nil),
    $: vi.fn().mockResolvedValue(nil),
    waitForSelector: vi.fn().mockResolvedValue(nil),
    evaluateHandle: vi.fn().mockResolvedValue(nil),
    evaluate: vi.fn().mockResolvedValue([1200, 800]),
    setViewport: vi.fn().mockResolvedValue(nil),
    pdf: vi.fn().mockResolvedValue(nil),
    screenshot: vi.fn().mockResolvedValue(nil),
    close: vi.fn().mockResolvedValue(nil),
  }
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(nil),
  }
  const browser = {
    pages: vi.fn().mockResolvedValue([]),
    version: vi.fn().mockResolvedValue('HeadlessChrome/155.0.0.0'),
    createBrowserContext: vi.fn().mockResolvedValue(context),
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(nil),
  }
  return { pageProto: page, contextProto: context, browserProto: browser }
})

vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockImplementation(async () => browserProto),
  },
  TimeoutError: class TimeoutError extends Error {},
}))

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.mocked(puppeteer.launch).mockClear()
  Object.values(pageProto).forEach((v) => v.mockClear())
  Object.values(contextProto).forEach((v) => v.mockClear())
  Object.values(browserProto).forEach((v) => v.mockClear())
})

afterEach(async () => {
  await closeBrowser()
})

describe('capture', () => {
  it('prints blank page if no params', async () => {
    await capture(CaptureType.PDF, {})
    expect(puppeteer.launch).toHaveBeenCalled()
    expect(pageProto.setContent).not.toHaveBeenCalled()
    expect(pageProto.evaluateHandle).toHaveBeenCalledWith('document.fonts.ready')
    expect(pageProto.goto).toHaveBeenCalledWith('about:blank', { waitUntil: ['load'] })
    expect(pageProto.pdf).toHaveBeenCalled()
    expect(pageProto.close).toHaveBeenCalled()
    expect(contextProto.close).toHaveBeenCalled()
    // the browser is shared between captures
    expect(browserProto.close).not.toHaveBeenCalled()
  })

  it('prints html content', async () => {
    await capture(CaptureType.PDF, { html: '<html />' })
    expect(puppeteer.launch).toHaveBeenCalled()
    expect(pageProto.setContent).toHaveBeenCalledWith('<html />', { waitUntil: ['load'] })
    expect(pageProto.waitForNetworkIdle).not.toHaveBeenCalled()
    expect(pageProto.goto).not.toHaveBeenCalled()
    expect(pageProto.evaluateHandle).toHaveBeenCalledWith('document.fonts.ready')
    expect(pageProto.pdf).toHaveBeenCalled()
    expect(pageProto.close).toHaveBeenCalled()
    expect(contextProto.close).toHaveBeenCalled()
  })

  it('reports an unreachable url as a 502 and keeps the browser', async () => {
    pageProto.goto.mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED at http://does-not-exist.invalid'))
    const error = await capture(CaptureType.PDF, { url: 'http://does-not-exist.invalid' }).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(502)
    expect(contextProto.close).toHaveBeenCalled()

    await capture(CaptureType.PDF, {})
    expect(puppeteer.launch).toHaveBeenCalledTimes(1)
    expect(browserProto.close).not.toHaveBeenCalled()
  })

  it('replaces the browser when rendering itself fails', async () => {
    pageProto.pdf.mockRejectedValueOnce(new Error('Protocol error (Page.printToPDF): Target closed'))
    const error = await capture(CaptureType.PDF, {}).catch((e) => e)
    expect(error).not.toBeInstanceOf(TargetError)
    await new Promise((resolve) => { setImmediate(resolve) })
    expect(browserProto.close).toHaveBeenCalled()
  })

  it('waits for network idle separately when html is set', async () => {
    await capture(CaptureType.PDF, { html: '<html />', waitUntil: ['load', 'networkidle2', 'networkidle0'] })
    expect(pageProto.setContent).toHaveBeenCalledWith('<html />', { waitUntil: ['load'] })
    expect(pageProto.waitForNetworkIdle).toHaveBeenCalledWith({ concurrency: 0, timeout: expect.any(Number) })
  })

  it('still waits for the document to load when html only asks for network idle', async () => {
    await capture(CaptureType.PDF, { html: '<html />', waitUntil: ['networkidle0'] })
    expect(pageProto.setContent).toHaveBeenCalledWith('<html />', { waitUntil: ['load'] })
    expect(pageProto.waitForNetworkIdle).toHaveBeenCalledWith({ concurrency: 0, timeout: expect.any(Number) })
  })

  it('gives network idle only what is left of the timeout after loading html', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(0)
      pageProto.setContent.mockImplementationOnce(async () => { vi.setSystemTime(400) })
      await capture(CaptureType.PDF, { html: '<html />', waitUntil: ['load', 'networkidle2'], timeout: 1000 })
      expect(pageProto.waitForNetworkIdle).toHaveBeenCalledWith({ concurrency: 2, timeout: 600 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not wait for a selector unless asked to', async () => {
    await capture(CaptureType.PDF, { html: '<html />' })
    await capture(CaptureType.PDF, { url: 'https://example.com' })
    expect(pageProto.$).not.toHaveBeenCalled()
    expect(pageProto.waitForSelector).not.toHaveBeenCalled()
  })

  it.each([
    ['html', { html: '<html />' }, 'setContent'],
    ['url', { url: 'https://example.com' }, 'goto'],
  ] as const)('waits for the selector after loading %s, before the fonts', async (_, params, load) => {
    await capture(CaptureType.PDF, { ...params, waitForSelector: '#pdf-ready' })
    expect(pageProto.$).toHaveBeenCalledWith('#pdf-ready')
    expect(pageProto.waitForSelector).toHaveBeenCalledWith('#pdf-ready', { timeout: expect.any(Number) })
    const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0]
    expect(order(pageProto.$)).toBeLessThan(order(pageProto[load]))
    expect(order(pageProto[load])).toBeLessThan(order(pageProto.waitForSelector))
    expect(order(pageProto.waitForSelector)).toBeLessThan(order(pageProto.evaluateHandle))
  })

  it('gives the selector only what is left of the timeout after loading', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(0)
      pageProto.setContent.mockImplementationOnce(async () => { vi.setSystemTime(300) })
      pageProto.waitForNetworkIdle.mockImplementationOnce(async () => { vi.setSystemTime(700) })
      await capture(CaptureType.PDF, {
        html: '<html />', waitUntil: ['networkidle0'], waitForSelector: '#pdf-ready', timeout: 1000,
      })
      expect(pageProto.waitForSelector).toHaveBeenCalledWith('#pdf-ready', { timeout: 300 })

      vi.setSystemTime(0)
      pageProto.goto.mockImplementationOnce(async () => { vi.setSystemTime(1500) })
      await capture(CaptureType.PDF, { url: 'https://example.com', waitForSelector: '#pdf-ready', timeout: 1000 })
      // at least 1 ms, 0 would disable the timeout
      expect(pageProto.waitForSelector).toHaveBeenLastCalledWith('#pdf-ready', { timeout: 1 })
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([42, '', ['#a', '#b']])('rejects waitForSelector %j as a 400 without opening a page', async (selector) => {
    const error = await capture(CaptureType.PDF, { waitForSelector: selector as string }).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
    expect(contextProto.newPage).not.toHaveBeenCalled()
  })

  it.each([
    [undefined, 60000],
    [0, 60000],
    [5000, 5000],
    [120000, 120000],
    [600000, 120000],
  ])('turns timeout %j into a navigation timeout of %j ms, at most MAX_TIMEOUT_MS', async (timeout, expected) => {
    await capture(CaptureType.PDF, { timeout })
    expect(pageProto.setDefaultNavigationTimeout).toHaveBeenCalledWith(expected)
  })

  it.each([-1, '5000', Infinity, NaN, {}])('rejects timeout %j as a 400 without opening a page', async (timeout) => {
    const error = await capture(CaptureType.PDF, { timeout: timeout as number }).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
    expect(contextProto.newPage).not.toHaveBeenCalled()
  })

  // puppeteer throws a plain Error on these, which would be taken for a service failure
  it.each([
    ['html', { html: 123 as unknown as string }],
    ['waitUntil', { html: '<html />', waitUntil: 'load' as unknown as [] }],
    ['pdfOptions.format', { pdfOptions: { format: 'bogus' } as never }],
    ['viewport.width', { viewport: { width: -5, height: 10 } }],
    ['screenshotOptions.type', { screenshotOptions: { type: 'gif' } as never }],
  ])('rejects invalid %s as a 400 without opening a browser', async (_, params) => {
    const error = await capture(CaptureType.PDF, params).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
    expect(puppeteer.launch).not.toHaveBeenCalled()
    expect(pageProto.pdf).not.toHaveBeenCalled()
  })

  it.each([
    ['pdf', CaptureType.PDF, 'pdf'],
    ['screenshot', CaptureType.Screenshot, 'screenshot'],
  ] as const)('reports options that Chromium rejects for the %s as a 400 and keeps the browser', async (_, type, method) => {
    pageProto[method].mockRejectedValueOnce(new Error('Protocol error (Page.printToPDF): paper width is zero or negative'))
    const error = await capture(type, {}).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
    expect(contextProto.close).toHaveBeenCalled()
    expect(browserProto.close).not.toHaveBeenCalled()
  })

  it('reports an invalid viewport that Chromium rejects as a 400', async () => {
    pageProto.setViewport.mockRejectedValueOnce(new Error(
      'Protocol error (Emulation.setDeviceMetricsOverride): Width and height values must be positive, not greater than 10000000',
    ))
    const error = await capture(CaptureType.PDF, { viewport: { width: 99999999, height: 10 } }).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
  })

  it('still treats a failing browser during pdf as a service failure', async () => {
    pageProto.pdf.mockRejectedValueOnce(new Error('Protocol error (Page.printToPDF): Target closed'))
    const error = await capture(CaptureType.PDF, {}).catch((e) => e)
    expect(error).not.toBeInstanceOf(TargetError)
    // the browser is replaced, the retry gets a fresh one
    expect(browserProto.close).toHaveBeenCalled()
  })

  it('reports an invalid selector as a 400 before loading the page and keeps the browser', async () => {
    const syntaxError = new Error("SyntaxError: Failed to execute 'querySelector' on 'Document': '#' is not a valid selector.")
    pageProto.$.mockRejectedValueOnce(syntaxError)
    const error = await capture(CaptureType.PDF, { url: 'https://example.com', waitForSelector: '#' }).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
    expect(pageProto.goto).not.toHaveBeenCalled()
    expect(contextProto.close).toHaveBeenCalled()
    expect(browserProto.close).not.toHaveBeenCalled()
  })

  it.each([
    'file:///etc/passwd',
    'FILE:///etc/passwd',
    ' file:///etc/passwd',
    'chrome://version',
    'view-source:http://example.com',
    'data:text/html,<p>x</p>',
  ])('rejects the url %j as a 400 without opening a browser', async (url) => {
    const error = await capture(CaptureType.PDF, { url }).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
    expect(puppeteer.launch).not.toHaveBeenCalled()
    expect(pageProto.goto).not.toHaveBeenCalled()
  })

  it('navigates to the url as it was checked, not to the string it was given', async () => {
    await capture(CaptureType.PDF, { url: ' HTTPS://Example.com/a b' })
    expect(pageProto.goto).toHaveBeenCalledWith('https://example.com/a%20b', expect.anything())
  })

  it('ignores the url when html is set, as before', async () => {
    await capture(CaptureType.PDF, { html: '<html />', url: 'file:///etc/passwd' })
    expect(pageProto.setContent).toHaveBeenCalled()
    expect(pageProto.goto).not.toHaveBeenCalled()
  })

  it('uses defaults as expected', async () => {
    await capture(CaptureType.PDF, {})
    expect(pageProto.pdf).toHaveBeenCalledWith({
      margin: {
        bottom: '0',
        left: '0',
        right: '0',
        top: '0',
      },
      preferCSSPageSize: true,
      printBackground: true,
      timeout: expect.any(Number),
    })
    expect(pageProto.screenshot).not.toHaveBeenCalled()
  })

  // puppeteer limits page.pdf to 30 s by default, and `pdfOptions.timeout: 0` lifts even that
  it('gives page.pdf the request timeout, whatever pdfOptions.timeout says', async () => {
    await capture(CaptureType.PDF, { timeout: 5000, pdfOptions: { timeout: 0 } })
    const { timeout } = pageProto.pdf.mock.calls[0][0]
    expect(timeout).toBeGreaterThan(4000)
    expect(timeout).toBeLessThanOrEqual(5000)
    await capture(CaptureType.PDF, { timeout: 5000, pdfOptions: { timeout: 600000 } })
    expect(pageProto.pdf.mock.calls[1][0].timeout).toBeLessThanOrEqual(5000)
  })

  it('gives printing a budget of its own, not what loading left of the timeout', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(0)
      pageProto.goto.mockImplementationOnce(async () => { vi.setSystemTime(990) })
      pageProto.evaluateHandle.mockImplementationOnce(async () => { vi.setSystemTime(1000) })
      await capture(CaptureType.PDF, { url: 'https://example.com', timeout: 1000 })
      // 1 ms would have been left of the first budget
      expect(pageProto.pdf.mock.calls[0][0].timeout).toBeGreaterThan(900)
    } finally {
      vi.useRealTimers()
    }
  })

  // not a TargetError: a hung browser looks the same, so it is retried on a fresh one first
  it.each([
    ['a screenshot', CaptureType.Screenshot, 'screenshot'],
    ['evaluating in the page', CaptureType.PDF, 'evaluateHandle'],
  ] as const)('stops waiting for %s after the timeout and replaces the browser', async (_, type, method) => {
    pageProto[method].mockImplementationOnce(() => new Promise(() => undefined))
    const error = await capture(type, { timeout: 50 }).catch((e) => e)
    expect(error).toBeInstanceOf(CaptureTimeoutError)
    expect(error).not.toBeInstanceOf(TargetError)
    expect(error.message).toMatch(/timed out after \d+ms/)
    expect(contextProto.close).toHaveBeenCalled()
    expect(browserProto.close).toHaveBeenCalled()
  })

  // puppeteer's own pdf timeout ("Timed out after waiting …ms") is told apart from a launch timeout too
  it('reports page.pdf running into its timeout as a CaptureTimeoutError', async () => {
    pageProto.pdf.mockRejectedValueOnce(new TimeoutError('Timed out after waiting 50ms'))
    const error = await capture(CaptureType.PDF, { timeout: 50 }).catch((e) => e)
    expect(error).toBeInstanceOf(CaptureTimeoutError)
    expect(error.message).toMatch(/^page\.pdf timed out after \d+ms$/)
    expect(browserProto.close).toHaveBeenCalled()
  })

  it('stops waiting for a PDF stream that never ends after the timeout', async () => {
    pageProto.pdf.mockImplementationOnce(() => new Promise(() => undefined))
    const error = await capture(CaptureType.PDF, { timeout: 50 }).catch((e) => e)
    expect(error).toBeInstanceOf(CaptureTimeoutError)
  })

  // more pixels than Chromium captures can kill its renderer, see ~/util/screenshot-size
  it.each([
    ['viewport', { viewport: { width: 16000, height: 16000, deviceScaleFactor: 4 } }, /the viewport is 64000 × 64000 px/],
    ['viewport', { viewport: { width: 20000, height: 20000 } }, /the viewport is 20000 × 20000 px/],
    [
      'clip',
      { screenshotOptions: { clip: { x: 0, y: 0, width: 10000, height: 10000, scale: 2 } } },
      /screenshotOptions\.clip is 20000 × 20000 px/,
    ],
  ])('rejects a screenshot whose %s is too large as a 400 without opening a browser', async (_, params, message) => {
    const error = await capture(CaptureType.Screenshot, params).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
    expect(error.message).toMatch(message)
    expect(puppeteer.launch).not.toHaveBeenCalled()
  })

  it('takes a screenshot of 16384 × 16384 px and prints any viewport', async () => {
    await capture(CaptureType.Screenshot, { viewport: { width: 8192, height: 8192, deviceScaleFactor: 2 } })
    expect(pageProto.screenshot).toHaveBeenCalled()
    await capture(CaptureType.PDF, { viewport: { width: 16000, height: 16000, deviceScaleFactor: 4 } })
    expect(pageProto.pdf).toHaveBeenCalled()
  })

  it('rejects a fullPage screenshot of a page too large as a 400 and keeps the browser', async () => {
    pageProto.evaluate.mockResolvedValueOnce([1200, 100000])
    const error = await capture(CaptureType.Screenshot, {
      viewport: { width: 1200, height: 800, deviceScaleFactor: 2 },
      screenshotOptions: { fullPage: true },
    }).catch((e) => e)
    expect(error).toBeInstanceOf(TargetError)
    expect(error.status).toBe(400)
    expect(error.message).toMatch(/the full page is 2400 × 200000 px/)
    expect(pageProto.screenshot).not.toHaveBeenCalled()
    expect(contextProto.close).toHaveBeenCalled()
    expect(browserProto.close).not.toHaveBeenCalled()
  })

  it('measures the page only for a fullPage screenshot', async () => {
    await capture(CaptureType.Screenshot, {})
    expect(pageProto.evaluate).not.toHaveBeenCalled()
    pageProto.evaluate.mockResolvedValueOnce([1200, 100000])
    await capture(CaptureType.Screenshot, { screenshotOptions: { fullPage: true } })
    expect(pageProto.evaluate).toHaveBeenCalledTimes(1)
    expect(pageProto.screenshot).toHaveBeenLastCalledWith({ fullPage: true, encoding: 'binary' })
  })

  it('uses defaults as expected', async () => {
    await capture(CaptureType.Screenshot, {})
    expect(pageProto.setViewport).toHaveBeenCalledWith(defaultViewportOptions)
    expect(pageProto.screenshot).toHaveBeenCalledWith({ encoding: 'binary' })
    expect(pageProto.pdf).not.toHaveBeenCalled()
  })
})
