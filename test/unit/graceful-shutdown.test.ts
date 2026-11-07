import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'
import { createServer, request, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { gracefulShutdown } from '~/util/graceful-shutdown'

// answers /slow after `delay` ms, everything else at once
const startServer = async (delay: number, onSent = () => {}): Promise<Server> => {
  const server = createServer((req, res) => {
    res.on('finish', onSent)
    setTimeout(() => res.end('done'), req.url === '/slow' ? delay : 0)
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  return server
}

const portOf = (target: Server) => (target.address() as AddressInfo).port

const get = (target: Server | number, path: string) => new Promise<string>((resolve, reject) => {
  const port = typeof target === 'number' ? target : portOf(target)
  request({ host: '127.0.0.1', port, path }, (res) => {
    let body = ''
    res.on('data', (chunk) => { body += chunk })
    res.on('end', () => resolve(body))
    res.on('error', reject)
  }).on('error', reject).end()
})

const settled = <T>(promise: Promise<T>) => promise.then(
  (value) => ({ value }),
  (error: Error) => ({ error: error.message }),
)

let server: Server

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  server.closeAllConnections()
  server.close()
  vi.restoreAllMocks()
})

describe('graceful shutdown', () => {
  it('lets a request in flight finish, refuses new connections, closes the browser and exits 0', async () => {
    const events: string[] = []
    server = await startServer(300, () => events.push('response sent'))
    const port = portOf(server)
    const closeBrowser = vi.fn().mockImplementation(async () => { events.push('browser closed') })
    let exit: (code: number) => void = () => undefined
    const exited = new Promise<number>((resolve) => {
      exit = (code) => {
        events.push('exit')
        resolve(code)
      }
    })
    const shutdown = gracefulShutdown(server, { timeout: 5000, closeBrowser, exit })
    const inFlight = get(server, '/slow')
    await new Promise((resolve) => { setTimeout(resolve, 50) })

    const started = Date.now()
    shutdown('SIGTERM')
    shutdown('SIGTERM') // a second signal changes nothing
    expect(server.listening).toBe(false)
    expect(await inFlight).toBe('done')
    expect(await exited).toBe(0)
    // not after the keep-alive timeout (5 s) of the client's connection
    expect(Date.now() - started).toBeLessThan(2000)
    expect(events).toEqual(['response sent', 'browser closed', 'exit'])
    expect(closeBrowser).toHaveBeenCalledTimes(1)
    expect(await settled(get(port, '/'))).toMatchObject({ error: expect.stringMatching(/ECONNREFUSED/) })
  })

  it('does not wait for a request beyond the timeout and exits 1, without closing the browser first', async () => {
    server = await startServer(60000)
    const closeBrowser = vi.fn().mockResolvedValue(undefined)
    const exit = vi.fn()
    const inFlight = settled(get(server, '/slow'))
    await new Promise((resolve) => { setTimeout(resolve, 50) })
    const started = Date.now()
    gracefulShutdown(server, { timeout: 200, closeBrowser, exit })('SIGTERM')
    // cut off
    expect(await inFlight).toMatchObject({ error: expect.any(String) })
    expect(Date.now() - started).toBeLessThan(2000)
    // closing the connections also runs the server.close() callback: it must neither exit again nor
    // close the browser, under the captures still running (they would take the retry)
    await new Promise((resolve) => { setTimeout(resolve, 50) })
    expect(exit.mock.calls).toEqual([[1]])
    expect(closeBrowser).not.toHaveBeenCalled()
  })

  it('exits at once when nothing is in flight, also if closing the browser fails', async () => {
    server = await startServer(0)
    const closeBrowser = vi.fn().mockRejectedValue(new Error('already gone'))
    const code = await new Promise<number>((resolve) => {
      gracefulShutdown(server, { timeout: 5000, closeBrowser, exit: resolve })('SIGINT')
    })
    expect(code).toBe(0)
  })
})
