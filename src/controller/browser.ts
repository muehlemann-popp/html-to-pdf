import puppeteer, { Browser, BrowserContext } from 'puppeteer'
import timestamp from '~/util/timestamp'

/**
 One browser serves all requests, each request gets its own BrowserContext (separate cookies, storage
 and cache) and closes it afterwards. Launching a browser per request costs a browser, a GPU and a
 renderer process each (~50 MB and ~40 ms), see docs/adr/0002-shared-browser.md.

 The browser is replaced after a failed capture, after BROWSER_MAX_CAPTURES captures, and closed after
 BROWSER_IDLE_TIMEOUT_MS without requests, so a long-lived Chromium can neither stay broken nor grow.
*/

const maxCaptures = Number(process.env.BROWSER_MAX_CAPTURES) || 100
const idleTimeout = Number(process.env.BROWSER_IDLE_TIMEOUT_MS) || 30000

/**
 Chromium runs without its sandbox by default (--no-sandbox), so a renderer exploited by a page runs
 with the rights of the service. CHROME_SANDBOX=1 turns the sandbox on. Only the user-namespace sandbox
 exists here: Alpine's chromium-headless-shell ships no setuid chrome-sandbox, hence
 --disable-setuid-sandbox in both modes. It needs the zygote (no --no-zygote), unprivileged user
 namespaces on the host and a seccomp profile that allows creating them (deploy/chrome-seccomp.json);
 under Docker's default profile the launch fails with "No usable sandbox!". It does not stop pages from
 fetching internal URLs. See docs/adr/0003-opt-in-chromium-sandbox.md.
 @see: https://pptr.dev/troubleshooting#setting-up-chrome-linux-sandbox
*/
const launch = async (): Promise<Browser> => {
  const sandbox = process.env.CHROME_SANDBOX === '1'
  const browser = await puppeteer.launch({
    // chrome-headless-shell in the image; with a regular Chrome binary (local dev) this is new headless
    headless: 'shell',
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
      '--disable-software-rasterizer', // the GPU process is unused, keep it small
      // network service inside the browser process instead of its own process
      '--enable-features=NetworkService,NetworkServiceInProcess2',
      '--font-render-hinting=none',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      ...(sandbox ? [] : ['--no-sandbox', '--no-zygote']), // see above
      '--safebrowsing-disable-auto-update',
      // no --single-process or --in-process-gpu: Chromium 155 crashes on startup with either
    ],
  })
  try {
    // the initial about:blank tab would keep a renderer process alive for nothing
    await Promise.all((await browser.pages()).map((page) => page.close()))
    // eslint-disable-next-line no-console
    console.info(`[${timestamp()}] Browser launched: ${await browser.version()}, sandbox ${sandbox ? 'on' : 'off'}`)
  } catch (e) {
    // nobody gets this browser, so nobody else would close its process and temporary profile
    await browser.close().catch(() => undefined)
    throw e
  }
  return browser
}

interface SharedBrowser {
  browser: Promise<Browser>
  active: number
  captures: number
  retired: boolean
  closed: boolean
}

let current: SharedBrowser | null = null
let idleTimer: NodeJS.Timeout | undefined

// stop handing out this browser, close it once its last capture is done
const retire = (shared: SharedBrowser): void => {
  // eslint-disable-next-line no-param-reassign
  shared.retired = true
  if (current === shared) {
    current = null
  }
  if (shared.active === 0 && !shared.closed) {
    // eslint-disable-next-line no-param-reassign
    shared.closed = true
    shared.browser.then((browser) => browser.close()).catch(() => undefined)
  }
}

const start = (): SharedBrowser => {
  const shared: SharedBrowser = {
    browser: launch(), active: 0, captures: 0, retired: false, closed: false,
  }
  shared.browser.then(
    (browser) => browser.on('disconnected', () => retire(shared)),
    () => retire(shared),
  )
  return shared
}

const release = (shared: SharedBrowser, failed: boolean): void => {
  // eslint-disable-next-line no-param-reassign
  shared.active -= 1
  // a failed capture may have left the browser in a bad state, so the retry gets a fresh one
  if (failed || shared.retired) {
    retire(shared)
  } else if (shared.active === 0) {
    idleTimer = setTimeout(() => retire(shared), idleTimeout)
    idleTimer.unref()
  }
}

export interface Lease {
  context: BrowserContext
  release: (failed: boolean) => Promise<void>
}

export const acquireContext = async (): Promise<Lease> => {
  clearTimeout(idleTimer)
  if (current && current.captures >= maxCaptures) {
    retire(current)
  }
  if (!current) {
    current = start()
  }
  const shared = current
  shared.active += 1
  shared.captures += 1
  try {
    const context = await (await shared.browser).createBrowserContext()
    return {
      context,
      release: async (failed) => {
        // a context that cannot be closed means a broken browser, but the capture itself may be fine
        const closed = await context.close().then(() => true, () => false)
        release(shared, failed || !closed)
      },
    }
  } catch (e) {
    release(shared, true)
    throw e
  }
}

// closes the shared browser right away, for tests and shutdown
export const closeBrowser = async (): Promise<void> => {
  clearTimeout(idleTimer)
  const shared = current
  current = null
  if (shared && !shared.closed) {
    shared.retired = true
    shared.closed = true
    await shared.browser.then((browser) => browser.close()).catch(() => undefined)
  }
}
