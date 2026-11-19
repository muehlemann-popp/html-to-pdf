import { intFromEnv } from '~/util/env'

// `timeout` of a request when it gives none (or 0)
export const defaultNavigationTimeout = 60000

// a larger `timeout` is lowered to this, so no request holds a browser context for longer
export const maxNavigationTimeout = intFromEnv('MAX_TIMEOUT_MS', 120000, 1)

/**
 How long puppeteer waits for any single DevTools call (its default is 180 s). Every wait that a request
 can make long is raced against its own `timeout` (~/controller/capture), at most MAX_TIMEOUT_MS, and that
 race has to end first: a protocol timeout is a plain `ProtocolError`, which counts as a service failure
 (retried, then the process exits) instead of the caller's 504. Hence MAX_TIMEOUT_MS plus a margin, also
 when MAX_TIMEOUT_MS is above 180 s. Calls the service makes on its own (a new page, closing a context,
 setting the viewport) take milliseconds and fail as a service failure after this long.
*/
export const protocolTimeout = maxNavigationTimeout + 10000
