import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '~/app'

// none of these reaches a capture, so no browser is needed
describe('answers about the request body', () => {
  it.each(['/pdf', '/screenshot'])('answers malformed JSON for %s with a JSON 400', async (path) => {
    await request(app).post(path).set('Content-Type', 'application/json').send('{bad')
      .expect('Content-Type', /application\/json/)
      .expect(400)
      .expect((res) => {
        expect(res.body.status).toBe('error')
        expect(res.body.message).toMatch(/JSON/)
      })
  })

  it('answers a body above the limit with a JSON 413', async () => {
    const html = 'x'.repeat(31 * 1024 * 1024)
    await request(app).post('/pdf').send({ html })
      .expect('Content-Type', /application\/json/)
      .expect(413)
      .expect((res) => {
        expect(res.body).toStrictEqual({ status: 'error', message: 'request entity too large' })
      })
  })

  it.each([
    ['text/plain', '{"html":"<h1>hello</h1>"}'],
    ['application/x-www-form-urlencoded', 'html=%3Ch1%3Ehello%3C%2Fh1%3E'],
  ])('answers a %s body with a JSON 415, not a blank PDF', async (contentType, body) => {
    await request(app).post('/pdf').set('Content-Type', contentType).send(body)
      .expect('Content-Type', /application\/json/)
      .expect(415)
      .expect((res) => {
        expect(res.body.status).toBe('error')
        expect(res.body.message).toContain(`unsupported Content-Type ${contentType}`)
        expect(res.body.message).toContain('application/json')
      })
  })

  it('answers a body without any Content-Type with a 415', async () => {
    await request(app).post('/screenshot').unset('Content-Type').send(Buffer.from('{"html":"x"}'))
      .expect(415)
  })
})
