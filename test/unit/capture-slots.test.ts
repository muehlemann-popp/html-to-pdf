import { describe, expect, it } from 'vitest'
import { CaptureRejectedError, createCaptureSlots } from '~/controller/capture-slots'

// a task that runs until the test finishes it
const deferred = () => {
  let finish: (fail?: Error) => void = () => undefined
  const done = new Promise<void>((resolve, reject) => {
    finish = (fail) => (fail ? reject(fail) : resolve())
  })
  return { task: () => done, finish }
}

const flush = () => new Promise((resolve) => { setImmediate(resolve) })

describe('capture slots', () => {
  it('runs at most maxActive tasks at once, the others wait', async () => {
    const slots = createCaptureSlots(2, 10)
    const tasks = [deferred(), deferred(), deferred()]
    const started: number[] = []
    const runs = tasks.map((t, i) => slots.run(() => {
      started.push(i)
      return t.task()
    }))
    await flush()
    expect(started).toEqual([0, 1])
    expect(slots.active).toBe(2)
    expect(slots.queued).toBe(1)

    tasks[0].finish()
    await flush()
    expect(started).toEqual([0, 1, 2])
    expect(slots.active).toBe(2)
    expect(slots.queued).toBe(0)

    tasks[1].finish()
    tasks[2].finish()
    await Promise.all(runs)
    expect(slots.active).toBe(0)
  })

  it('starts waiting tasks in arrival order', async () => {
    const slots = createCaptureSlots(1, 10)
    const first = deferred()
    const started: number[] = []
    const runs = [slots.run(first.task)]
    for (let i = 1; i <= 4; i += 1) {
      runs.push(slots.run(async () => { started.push(i) }))
    }
    await flush()
    expect(started).toEqual([])
    first.finish()
    await Promise.all(runs)
    expect(started).toEqual([1, 2, 3, 4])
  })

  it('rejects with 503 and Retry-After once the queue is full, without running the task', async () => {
    const slots = createCaptureSlots(1, 1)
    const running = deferred()
    const queued = deferred()
    const runs = [slots.run(running.task), slots.run(queued.task)]
    let ran = false
    const rejected = slots.run(async () => { ran = true })
    await expect(rejected).rejects.toBeInstanceOf(CaptureRejectedError)
    await expect(rejected).rejects.toMatchObject({ status: 503, retryAfter: 1 })
    expect(ran).toBe(false)
    expect(slots.queued).toBe(1)

    running.finish()
    queued.finish()
    await Promise.all(runs)
  })

  it('rejects at once with MAX_QUEUED_CAPTURES=0 when all slots are busy', async () => {
    const slots = createCaptureSlots(1, 0)
    const running = deferred()
    const run = slots.run(running.task)
    await expect(slots.run(async () => undefined)).rejects.toBeInstanceOf(CaptureRejectedError)
    running.finish()
    await run
    await slots.run(async () => undefined)
  })

  it('frees the slot when a task fails, and hands it to the next waiting task', async () => {
    const slots = createCaptureSlots(1, 1)
    const failing = deferred()
    const failed = slots.run(failing.task)
    let ran = false
    const next = slots.run(async () => { ran = true })
    failing.finish(new Error('render failed'))
    await expect(failed).rejects.toThrow('render failed')
    await next
    expect(ran).toBe(true)
    expect(slots.active).toBe(0)
  })

  it('drops a waiting task whose client hung up, and keeps the order of the others', async () => {
    const slots = createCaptureSlots(1, 2)
    const running = deferred()
    const hungUp = new AbortController()
    const started: string[] = []
    const run = slots.run(running.task)
    const gone = slots.run(async () => { started.push('gone') }, hungUp.signal)
    const stays = slots.run(async () => { started.push('stays') })
    hungUp.abort()
    await expect(gone).rejects.toBeInstanceOf(CaptureRejectedError)
    expect(slots.queued).toBe(1)

    running.finish()
    await Promise.all([run, stays])
    expect(started).toEqual(['stays'])
    expect(slots.active).toBe(0)
  })

  it('does not start a task whose client is already gone', async () => {
    const slots = createCaptureSlots(1, 1)
    const hungUp = new AbortController()
    hungUp.abort()
    await expect(slots.run(async () => undefined, hungUp.signal)).rejects.toBeInstanceOf(CaptureRejectedError)
    expect(slots.active).toBe(0)
  })
})
