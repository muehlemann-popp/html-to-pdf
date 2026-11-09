import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest'
import request from 'supertest'
import type { Application } from 'express'
import type { CaptureSlots } from '~/controller/capture-slots'

let app: Application
let slots: CaptureSlots
let closeBrowser: () => Promise<void>

beforeAll(async () => {
  // read when the modules are loaded; vitest loads them afresh for every test file
  process.env.MAX_CONCURRENT_CAPTURES = '1'
  process.env.MAX_QUEUED_CAPTURES = '0'
  process.env.MAX_TIMEOUT_MS = '1500'
  app = (await import('~/app')).default
  slots = (await import('~/controller/capture-slots')).captureSlots;
  ({ closeBrowser } = await import('~/controller/browser'))
})

afterAll(async () => {
  await closeBrowser()
  delete process.env.MAX_CONCURRENT_CAPTURES
  delete process.env.MAX_QUEUED_CAPTURES
  delete process.env.MAX_TIMEOUT_MS
})

const waitFor = async (condition: () => boolean) => {
  while (!condition()) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10) })
  }
}

// the service must answer these and keep running: vitest fails the run if process.exit is called
describe('capture limits', () => {
  it('answers 503 with Retry-After while all slots are busy, and frees the slot after a failed capture', async () => {
    const started = Date.now()
    // asks for 60 s, gets MAX_TIMEOUT_MS: the selector never appears, so it holds the only slot until then
    const slow = request(app).post('/pdf')
      .send({ html: '<p>never ready</p>', waitForSelector: '#pdf-ready', timeout: 60000 })
      .then((res) => res)
    await waitFor(() => slots.active === 1)

    await request(app).post('/pdf').send({ html: '<p>hello</p>' })
      .expect(503)
      .expect('Retry-After', '1')
      .expect('Content-Type', /application\/json/)
      .expect((res) => {
        expect(res.body).toStrictEqual({
          status: 'error', message: 'too many captures: 1 running and 0 queued, try again later',
        })
      })

    // readiness does not depend on being busy
    await request(app).get('/selfcheck').expect(200)

    const slowRes = await slow
    expect(slowRes.status).toBe(504)
    expect(Date.now() - started).toBeLessThan(10000)
    expect(slots.active).toBe(0)

    await request(app).post('/pdf').send({ html: '<p>hello</p>' })
      .expect('Content-Type', /application\/pdf/)
      .expect(200)
  })
})
