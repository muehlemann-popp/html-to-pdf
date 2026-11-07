import type { Server, ServerResponse } from 'node:http'
import timestamp from '~/util/timestamp'

export interface ShutdownOptions {
  // how long requests in flight may take before the process exits anyway
  timeout: number
  closeBrowser: () => Promise<void>
  exit: (code: number) => void
}

/**
 Stops the service for SIGTERM/SIGINT (docker stop, a Kubernetes rollout): no new connections, requests
 in flight finish, then the browser is closed and the process exits 0. Requests still running after
 `timeout` are cut off and the process exits 1. deploy/docker-entrypoint.sh forwards the signal and does
 not restart node afterwards. Call it once the server is created; it returns the function to call with
 the signal, later calls of which are ignored.
*/
export const gracefulShutdown = (server: Server, { timeout, closeBrowser, exit }: ShutdownOptions) => {
  let stopping = false
  const inFlight = new Set<ServerResponse>()

  // server.close() leaves a keep-alive connection open after its response (until keepAliveTimeout),
  // so responses sent while stopping say Connection: close, and Node closes the connection after them
  const closeAfter = (res: ServerResponse) => {
    if (!res.headersSent) {
      res.setHeader('Connection', 'close')
    }
  }

  server.on('request', (req, res: ServerResponse) => {
    inFlight.add(res)
    res.on('close', () => {
      inFlight.delete(res)
      if (stopping) {
        // a response whose headers were already sent: close its connection once it is idle
        setImmediate(() => server.closeIdleConnections())
      }
    })
    if (stopping) {
      closeAfter(res)
    }
  })

  let exiting = false
  // once: after the timeout, closing the connections also runs the server.close() callback
  const finish = async (code: number) => {
    if (exiting) {
      return
    }
    exiting = true
    await closeBrowser().catch(() => undefined)
    exit(code)
  }

  return (signal: string): void => {
    if (stopping) {
      return
    }
    stopping = true
    // eslint-disable-next-line no-console
    console.info(`[${timestamp()}] ${signal} received, finishing ${inFlight.size} requests in flight`
      + ` (up to ${timeout}ms)`)
    inFlight.forEach(closeAfter)

    const timer = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn(`[${timestamp()}] ${inFlight.size} requests still running after ${timeout}ms, exiting anyway`)
      server.closeAllConnections()
      finish(1)
    }, timeout)

    // stops listening and closes idle connections; the callback runs once no connection is left
    server.close(() => {
      clearTimeout(timer)
      if (!exiting) {
        // eslint-disable-next-line no-console
        console.info(`[${timestamp()}] all requests finished, exiting`)
      }
      finish(0)
    })
  }
}
