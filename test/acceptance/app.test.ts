import request from 'supertest'
import app from '~/app'

async function downloadPDF(cb: (v: request.SuperTest<request.Test>) => request.Test): Promise<string> {
  const response = await cb(request(app))
    .expect('Content-Type', /application\/pdf/)
    .expect(200)
    .buffer()
    .parse((res, callback) => {
      let data = ''
      res.setEncoding('binary')
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        callback(null, Buffer.from(data, 'binary'))
      })
    })
  return response.body.toString()
}

function testPDFContent(content: string) {
  expect(content).toContain('%PDF-1.4')
  expect(content).toContain('/Creator (Chromium)')
  expect(content).toContain('%%EOF')
}

function testBlankPDFContent(content: string) {
  testPDFContent(content)
  expect(content.length).toBeGreaterThan(500)
  expect(content.length).toBeLessThan(2000)
}

describe('Basic routing', () => {
  it('should display readme when opening root', async () => {
    await request(app)
      .get('/')
      .expect('Content-Type', /text\/html/)
      .expect(200)
      .expect(/Microservice for generating PDF and screenshots/)
  })

  it('should print about:blank when GET /pdf without parameters', async () => {
    const content: string = await downloadPDF((req) => req.get('/pdf'))
    testBlankPDFContent(content)
  })

  it('should print about:blank when POST /pdf without parameters', async () => {
    const content: string = await downloadPDF((req) => req.post('/pdf'))
    testBlankPDFContent(content)
  })

  it('should print example.com with POST /pdf', async () => {
    // localhost cannot be used here as real server is not spinned up
    const body = { url: 'https://example.com', waitUntil: ['load'] }
    const content: string = await downloadPDF((req) => req.post('/pdf').send(body))
    testPDFContent(content)
    expect(content.length).toBeGreaterThan(2000)
  })

  it('should print example.com with GET /pdf', async () => {
    // localhost cannot be used here as real server is not spinned up
    const content: string = await downloadPDF((req) => req.get('/pdf?url=https://example.com'))
    testPDFContent(content)
    expect(content.length).toBeGreaterThan(2000)
  })

  it('/health should return ok', async () => {
    // localhost cannot be used here as real server is not spinned up
    await request(app).get('/health')
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toStrictEqual({ status: 'ok' })
      })
  })
})
