import app from '~/app'
import timestamp from '~/util/timestamp'

const { PORT = 4000 } = process.env

process.setMaxListeners(100)

app.listen(PORT, (error) => {
  // express 5 hands a listen error (e.g. port in use) to this callback instead of crashing the process
  if (error) {
    throw error
  }
  // eslint-disable-next-line no-console
  console.info(`[${timestamp()}] server started at http://localhost:${PORT}`)
})
