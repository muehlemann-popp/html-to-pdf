import app from '~/app'
import timestamp from '~/util/timestamp'

const { PORT = 4000 } = process.env

process.setMaxListeners(100)

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.info(`[${timestamp()}] server started at http://localhost:${PORT}`)
})
