import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'
import request from 'supertest'
import app from '~/app'
import capture from '~/controller/capture'
import { CaptureRejectedError, captureSlots } from '~/controller/capture-slots'
import {
  captureDuration, capturesInProgress, capturesQueued, pdfCounter,
} from '~/controller/metrics'
import { TargetError } from '~/util/target-error'

vi.mock('~/controller/capture', () => ({
  default: vi.fn(),
  defaultUrl: 'about:blank',
}))

const pdf = new Uint8Array(Buffer.from('%PDF-1.7 test'))

// observations of capture_duration_seconds with these labels
const observed = async (type: string, outcome: string) => (await captureDuration.get()).values
  .find((v) => v.metricName === 'capture_duration_seconds_count'
    && v.labels.type === type && v.labels.outcome === outcome)?.value ?? 0

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.mocked(capture).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('capture metrics', () => {
  it('observes the duration of a successful capture as ok, by type', async () => {
    vi.mocked(capture).mockResolvedValue(pdf)
    const [pdfOk, screenshotOk] = [await observed('pdf', 'ok'), await observed('screenshot', 'ok')]
    await request(app).post('/pdf').expect(200)
    await request(app).post('/screenshot').expect(200)
    expect(await observed('pdf', 'ok')).toBe(pdfOk + 1)
    expect(await observed('screenshot', 'ok')).toBe(screenshotOk + 1)
  })

  it('observes a page that cannot be loaded as target_error', async () => {
    vi.mocked(capture).mockRejectedValue(new TargetError('net::ERR_NAME_NOT_RESOLVED', 502))
    const before = await observed('pdf', 'target_error')
    await request(app).post('/pdf').send({ url: 'http://does-not-exist.invalid' }).expect(502)
    expect(await observed('pdf', 'target_error')).toBe(before + 1)
  })

  it('observes a capture that failed twice as service_error before exiting', async () => {
    vi.mocked(capture).mockRejectedValue(new Error('Target closed'))
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const before = await observed('pdf', 'service_error')
    await request(app).post('/pdf').expect(500)
    expect(await observed('pdf', 'service_error')).toBe(before + 1)
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('observes a capture turned away by a full queue as rejected', async () => {
    vi.spyOn(captureSlots, 'run').mockRejectedValueOnce(new CaptureRejectedError('too many captures'))
    const before = await observed('pdf', 'rejected')
    await request(app).post('/pdf').expect(503)
    expect(await observed('pdf', 'rejected')).toBe(before + 1)
    expect(capture).not.toHaveBeenCalled()
  })

  it('reports captures in progress and queued when scraped', async () => {
    const value = async (gauge: typeof capturesInProgress) => (await gauge.get()).values[0].value
    const finishers: (() => void)[] = []
    vi.mocked(capture).mockImplementation(() => new Promise((resolve) => {
      finishers.push(() => resolve(pdf))
    }))
    // one more than MAX_CONCURRENT_CAPTURES (default 8)
    const running = Array.from({ length: 9 }, () => request(app).post('/pdf').then((res) => res))
    while (captureSlots.queued === 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 5) })
    }
    expect(await value(capturesInProgress)).toBe(8)
    expect(await value(capturesQueued)).toBe(1)
    // the queued one starts once a slot is free
    for (let done = 0; done < 9;) {
      const finish = finishers.shift()
      if (finish) {
        finish()
        done += 1
      } else {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, 5) })
      }
    }
    expect((await Promise.all(running)).map((res) => res.status)).toEqual(Array(9).fill(200))
    expect(await value(capturesInProgress)).toBe(0)
    expect(await value(capturesQueued)).toBe(0)
    // the old counters keep counting
    expect((await pdfCounter.get()).values.find((v) => v.labels.method === 'post')?.value).toBeGreaterThan(0)
  })
})
