import {
  afterAll, describe, expect, it,
} from 'vitest'
import { readFileSync, readdirSync, readlinkSync } from 'node:fs'
import request from 'supertest'
import app from '~/app'
import { acquireContext, closeBrowser } from '~/controller/browser'

afterAll(closeBrowser)

const sandbox = process.env.CHROME_SANDBOX === '1'

// pids of all processes below `root`, with their command line, read from /proc
const descendants = (root: number): { pid: number, cmdline: string }[] => {
  const procs = readdirSync('/proc').filter((p) => /^\d+$/.test(p)).flatMap((p) => {
    try {
      // the command in field 2 may contain spaces, the parent pid follows its closing parenthesis
      const ppid = Number(readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' ')[1])
      return [{ pid: Number(p), ppid, cmdline: readFileSync(`/proc/${p}/cmdline`, 'utf8') }]
    } catch {
      return [] // exited in between
    }
  })
  const found = new Set([root])
  // parents can have higher pids than their children, so repeat until nothing is added
  for (let size = 0; size !== found.size;) {
    size = found.size
    procs.filter((p) => found.has(p.ppid)).forEach((p) => found.add(p.pid))
  }
  return procs.filter((p) => p.pid !== root && found.has(p.pid))
}

// reads /proc of the container, so only where the tests run with the image's Chromium
describe.runIf(process.platform === 'linux')(`Chromium sandbox (CHROME_SANDBOX=${sandbox ? 1 : 0})`, () => {
  it('/selfcheck should return ok', async () => {
    await request(app).get('/selfcheck')
      .expect(200)
      .expect((res) => {
        expect(res.body).toStrictEqual({ status: 'ok' })
      })
  })

  it(`renders in ${sandbox ? 'its own' : 'the service\'s'} user, pid and network namespace`, async () => {
    const lease = await acquireContext()
    try {
      const page = await lease.context.newPage()
      await page.setContent('<p>sandbox</p>')
      const pid = lease.context.browser().process()?.pid as number
      const renderers = descendants(pid).filter((p) => p.cmdline.includes('--type=renderer'))
      expect(renderers.length).toBeGreaterThan(0)
      renderers.forEach((renderer) => {
        ['user', 'pid', 'net'].forEach((ns) => {
          const own = readlinkSync(`/proc/self/ns/${ns}`)
          const its = readlinkSync(`/proc/${renderer.pid}/ns/${ns}`)
          if (sandbox) {
            expect(its).not.toBe(own)
          } else {
            expect(its).toBe(own)
          }
        })
      })
    } finally {
      await lease.release(false)
    }
  })
})
