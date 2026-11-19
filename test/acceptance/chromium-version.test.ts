import { afterAll, describe, expect, it } from 'vitest'
import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js'
import { acquireContext, closeBrowser } from '~/controller/browser'

afterAll(closeBrowser)

// Alpine updates Chromium to a new major within a release (3.24 went from 155 to 156), and only the
// newest version stays in its repository, so the image cannot pin it. A major that puppeteer does not
// target fails here, in CI, instead of shipping unnoticed: bump puppeteer to the release that targets
// it (AGENTS.md). Only with the image's Chromium; a local Chrome is usually another major.
describe.runIf(process.env.PUPPETEER_EXECUTABLE_PATH === '/usr/bin/chromium-headless-shell')('Chromium', () => {
  it('is the major that puppeteer targets', async () => {
    const lease = await acquireContext()
    try {
      // "HeadlessChrome/156.0.8078.79"
      const version = await lease.context.browser().version()
      const major = (v: string) => v.match(/(\d+)\./)?.[1]
      expect(major(version), `image ${version}, puppeteer ${PUPPETEER_REVISIONS['chrome-headless-shell']}`)
        .toBe(major(PUPPETEER_REVISIONS['chrome-headless-shell']))
    } finally {
      await lease.release(false)
    }
  })
})
