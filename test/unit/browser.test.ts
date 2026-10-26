import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'
import puppeteer from 'puppeteer'
import { acquireContext, closeBrowser } from '~/controller/browser'

const { newBrowser } = vi.hoisted(() => ({
  newBrowser: () => {
    const context = { close: vi.fn().mockResolvedValue(null) }
    return {
      context,
      pages: vi.fn().mockResolvedValue([{ close: vi.fn().mockResolvedValue(null) }]),
      version: vi.fn().mockResolvedValue('HeadlessChrome/155.0.0.0'),
      createBrowserContext: vi.fn().mockResolvedValue(context),
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(null),
    }
  },
}))

vi.mock('puppeteer', () => ({
  default: { launch: vi.fn() },
}))

type FakeBrowser = ReturnType<typeof newBrowser>
let launched: FakeBrowser[] = []

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  launched = []
  vi.mocked(puppeteer.launch).mockReset().mockImplementation(async () => {
    const browser = newBrowser()
    launched.push(browser)
    return browser as never
  })
})

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await closeBrowser()
  vi.restoreAllMocks()
})

const flush = () => new Promise((resolve) => { setImmediate(resolve) })

describe('shared browser', () => {
  it('closes the initial tab and reuses one browser for sequential and concurrent captures', async () => {
    const first = await acquireContext()
    const second = await acquireContext()
    await first.release(false)
    await second.release(false)
    await (await acquireContext()).release(false)

    expect(puppeteer.launch).toHaveBeenCalledTimes(1)
    expect((await launched[0].pages.mock.results[0].value)[0].close).toHaveBeenCalled()
    expect(launched[0].createBrowserContext).toHaveBeenCalledTimes(3)
    expect(launched[0].context.close).toHaveBeenCalledTimes(3)
    expect(launched[0].close).not.toHaveBeenCalled()
  })

  it('replaces the browser after a failed capture, once its other captures are done', async () => {
    const failing = await acquireContext()
    const running = await acquireContext()
    await failing.release(true)
    await flush()
    expect(launched[0].close).not.toHaveBeenCalled()

    await (await acquireContext()).release(false)
    expect(puppeteer.launch).toHaveBeenCalledTimes(2)

    await running.release(false)
    await flush()
    expect(launched[0].close).toHaveBeenCalled()
    expect(launched[1].close).not.toHaveBeenCalled()
  })

  it('replaces the browser when its context cannot be closed', async () => {
    const lease = await acquireContext()
    launched[0].context.close.mockRejectedValueOnce(new Error('Target closed'))
    await lease.release(false)
    await flush()
    expect(launched[0].close).toHaveBeenCalled()
  })

  it('replaces the browser after 100 captures', async () => {
    for (let i = 0; i < 100; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await (await acquireContext()).release(false)
    }
    expect(puppeteer.launch).toHaveBeenCalledTimes(1)
    await (await acquireContext()).release(false)
    await flush()
    expect(puppeteer.launch).toHaveBeenCalledTimes(2)
    expect(launched[0].close).toHaveBeenCalled()
  })

  it('closes the browser after 30s without captures', async () => {
    vi.useFakeTimers()
    await (await acquireContext()).release(false)
    await vi.advanceTimersByTimeAsync(29000)
    expect(launched[0].close).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(launched[0].close).toHaveBeenCalled()
    await (await acquireContext()).release(false)
    expect(puppeteer.launch).toHaveBeenCalledTimes(2)
  })

  it('launches without the sandbox unless CHROME_SANDBOX=1', async () => {
    vi.stubEnv('CHROME_SANDBOX', '')
    await (await acquireContext()).release(false)
    await closeBrowser()
    vi.stubEnv('CHROME_SANDBOX', '1')
    await (await acquireContext()).release(false)

    const [off, on] = vi.mocked(puppeteer.launch).mock.calls.map(([options]) => options?.args)
    expect(off).toEqual(expect.arrayContaining(['--no-sandbox', '--no-zygote', '--disable-setuid-sandbox']))
    // the namespace sandbox needs the zygote; there is no setuid sandbox to fall back to
    expect(on).not.toContain('--no-sandbox')
    expect(on).not.toContain('--no-zygote')
    expect(on).toContain('--disable-setuid-sandbox')
  })

  it('launches a new browser when the previous launch failed', async () => {
    vi.mocked(puppeteer.launch).mockRejectedValueOnce(new Error('launch failed'))
    await expect(acquireContext()).rejects.toThrow('launch failed')
    await (await acquireContext()).release(false)
    expect(puppeteer.launch).toHaveBeenCalledTimes(2)
  })

  it('closes a browser that launched but failed its setup', async () => {
    vi.mocked(puppeteer.launch).mockImplementationOnce(async () => {
      const browser = newBrowser()
      browser.version.mockRejectedValueOnce(new Error('Target closed'))
      launched.push(browser)
      return browser as never
    })
    await expect(acquireContext()).rejects.toThrow('Target closed')
    expect(launched[0].close).toHaveBeenCalled()
  })
})
