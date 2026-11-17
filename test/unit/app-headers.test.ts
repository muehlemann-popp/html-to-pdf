import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '~/app'

describe('response headers', () => {
  it.each(['/health', '/version', '/nope'])('do not name the framework on GET %s', async (path) => {
    const res = await request(app).get(path)
    expect(res.headers).not.toHaveProperty('x-powered-by')
  })
})
