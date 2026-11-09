import { intFromEnv } from '~/util/env'

/**
 Every capture holds a browser context and its renderer until it is done, so a burst of requests would
 open as many at once and can run the container out of memory. Captures therefore take a slot first:
 at most MAX_CONCURRENT_CAPTURES render at the same time, up to MAX_QUEUED_CAPTURES more wait for a
 slot in arrival order, and any request beyond that is answered with 503 right away. See
 docs/features/capture-limits.md.
*/

// seconds a rejected caller is asked to wait (Retry-After): a rejection is cheap, a slot frees up fast
const retryAfterSeconds = 1

/**
 The service is busy, not broken: answered with 503 and Retry-After, not retried, not reported to
 Sentry, and neither the browser nor the node process is replaced. Also what a queued capture ends with
 when its client hangs up, which leaves nobody to answer.
*/
export class CaptureRejectedError extends Error {
  readonly status = 503

  readonly retryAfter = retryAfterSeconds

  constructor(message: string) {
    super(message)
    this.name = 'CaptureRejectedError'
  }
}

export interface CaptureSlots {
  // runs the task once a slot is free and frees the slot when it settles; `signal` gives up the place
  // in the queue (not a running task)
  run: <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T>
  readonly active: number
  readonly queued: number
}

interface Waiter {
  start: () => void
  abort: () => void
}

export const createCaptureSlots = (maxActive: number, maxQueued: number): CaptureSlots => {
  let active = 0
  const queue: Waiter[] = []

  const acquire = (signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) {
      return Promise.reject(new CaptureRejectedError('the client closed the connection before its capture started'))
    }
    if (active < maxActive) {
      active += 1
      return Promise.resolve()
    }
    if (queue.length >= maxQueued) {
      return Promise.reject(new CaptureRejectedError(
        `too many captures: ${maxActive} running and ${maxQueued} queued, try again later`,
      ))
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        start: () => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        },
        abort: () => reject(new CaptureRejectedError('the client closed the connection before its capture started')),
      }
      const onAbort = () => {
        queue.splice(queue.indexOf(waiter), 1)
        waiter.abort()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      queue.push(waiter)
    })
  }

  const release = () => {
    const next = queue.shift()
    if (next) {
      // the slot goes straight to the next waiter, `active` stays the same
      next.start()
    } else {
      active -= 1
    }
  }

  return {
    run: async (task, signal) => {
      await acquire(signal)
      try {
        return await task()
      } finally {
        release()
      }
    },
    get active() {
      return active
    },
    get queued() {
      return queue.length
    },
  }
}

// /pdf and /screenshot; /selfcheck does not take a slot, see src/router.ts
export const captureSlots = createCaptureSlots(
  intFromEnv('MAX_CONCURRENT_CAPTURES', 8, 1),
  intFromEnv('MAX_QUEUED_CAPTURES', 32, 0),
)
