import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest'
import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'
import { gunzipSync } from 'node:zlib'
import { close, flush } from '@sentry/node'
import request from 'supertest'
import type { Application } from 'express'

// stands in for Sentry: collects the envelopes the SDK posts
const envelopes: string[] = []
const ingest = createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    envelopes.push((req.headers['content-encoding'] === 'gzip' ? gunzipSync(body) : body).toString())
    res.end('{}')
  })
})

let app: Application

beforeAll(async () => {
  await new Promise<void>((resolve) => { ingest.listen(0, '127.0.0.1', resolve) })
  process.env.SENTRY_DSN = `http://key@127.0.0.1:${(ingest.address() as AddressInfo).port}/1`
  // in the order of src/server.ts, once SENTRY_DSN is set
  await import('~/instrument')
  app = (await import('~/app')).default
})

afterAll(async () => {
  await close()
  delete process.env.SENTRY_DSN
  ingest.close()
})

describe('Sentry', () => {
  it('receives an error thrown by a route', async () => {
    await request(app).get('/debug-sentry').expect(500)
    await flush(5000)
    const events = envelopes.filter((e) => e.includes('"type":"event"'))
    expect(events).toHaveLength(1)
    expect(events[0]).toContain('Test Sentry error')
    expect(events[0]).toContain('auto.middleware.express')
  })
})
