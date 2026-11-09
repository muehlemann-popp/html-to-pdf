// first: Sentry is initialised before the app and its dependencies are loaded
import '~/instrument'
import app from '~/app'
import { closeBrowser } from '~/controller/browser'
import { intFromEnv } from '~/util/env'
import { gracefulShutdown } from '~/util/graceful-shutdown'
import timestamp from '~/util/timestamp'

const { PORT = 4000 } = process.env

process.setMaxListeners(100)

const server = app.listen(PORT, (error) => {
  // express 5 hands a listen error (e.g. port in use) to this callback instead of crashing the process
  if (error) {
    throw error
  }
  // eslint-disable-next-line no-console
  console.info(`[${timestamp()}] server started at http://localhost:${PORT}`)
})

const shutdown = gracefulShutdown(server, {
  timeout: intFromEnv('SHUTDOWN_TIMEOUT_MS', 25000, 0),
  closeBrowser,
  exit: (code) => process.exit(code),
})
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
