import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest'
import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'
import request from 'supertest'
import app from '~/app'
import { closeBrowser } from '~/controller/browser'

afterAll(closeBrowser)

async function downloadPDF(cb: (v: request.Agent) => request.Test): Promise<string> {
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
  expect(content).toMatch(/^%PDF-1\.\d/)
  expect(content).toContain('/Producer (Skia/PDF')
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
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(200)
      .expect(/Microservice for generating PDF and screenshots/)
      .expect((res) => {
        // rendered at build time, with the stylesheet inline instead of from a CDN
        expect(res.text).toMatch(/<h2[^>]*>.*Setup.*<\/h2>/)
        expect(res.text).toContain('<style>')
        expect(res.text).not.toMatch(/<link /)
      })
  })

  it('should serve the favicon', async () => {
    await request(app)
      .get('/favicon.ico')
      // the IANA type, express 4 sent image/x-icon
      .expect('Content-Type', /image\/vnd\.microsoft\.icon/)
      .expect(200)
  })

  it.each(['/nope', '/nope/deeper', '/pdf/nope'])('should answer %s with 404', async (path) => {
    await request(app)
      .get(path)
      .expect('Content-Type', /application\/json/)
      .expect(404)
      .expect((res) => {
        expect(res.body).toStrictEqual({ error: `not found: ${path}` })
      })
  })

  it('should take a screenshot of about:blank when POST /screenshot without parameters', async () => {
    await request(app)
      .post('/screenshot')
      .expect('Content-Type', /image\/png/)
      .expect(200)
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

  // the service must answer these and keep running: vitest fails the run if process.exit is called
  describe('pages that cannot be loaded', () => {
    // accepts connections and never answers, so loading from it runs into the timeout;
    // except /download, a file download that Chromium aborts (net::ERR_ABORTED on every attempt)
    const silent = createServer((req, res) => {
      if (req.url === '/download') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment' })
        res.end('x')
      }
    })
    const silentUrl = () => `http://127.0.0.1:${(silent.address() as AddressInfo).port}`
    beforeAll(() => new Promise<void>((resolve) => { silent.listen(0, '127.0.0.1', resolve) }))
    afterAll(() => {
      silent.closeAllConnections()
      silent.close()
    })

    it.each([
      ['an unresolvable host', () => ({ url: 'http://does-not-exist.invalid' }), 502, /ERR_NAME_NOT_RESOLVED/],
      ['a malformed url', () => ({ url: 'not a url' }), 400, /invalid URL/],
      ['a blocked port', () => ({ url: 'http://127.0.0.1:1' }), 400, /ERR_UNSAFE_PORT/],
      ['a navigation timeout', () => ({ url: silentUrl(), timeout: 1500 }), 504, /timeout/i],
      [
        'a network idle timeout',
        () => ({ html: `<img src="${silentUrl()}/x.png">`, waitUntil: ['networkidle0'], timeout: 1500 }),
        504,
        /timeout|timed out/i,
      ],
      // retried on a fresh browser first, since ERR_ABORTED can also mean a failing browser
      ['a download', () => ({ url: `${silentUrl()}/download` }), 502, /ERR_ABORTED/],
      [
        'a selector that never appears',
        () => ({ html: '<p>never ready</p>', waitForSelector: '#pdf-ready', timeout: 1500 }),
        504,
        /Waiting for selector `#pdf-ready` failed/,
      ],
      ['an invalid selector', () => ({ html: '<p>x</p>', waitForSelector: 'a[' }), 400, /is not a valid selector/],
      ['an invalid XPath selector', () => ({ waitForSelector: '::-p-xpath(//[)' }), 400, /not a valid XPath/],
      // thrown as a plain Error, it used to take the retry and make the process exit
      ['an unknown puppeteer selector', () => ({ waitForSelector: '::-p-madeup' }), 400, /Unknown selector type/],
      ['an empty selector', () => ({ waitForSelector: '' }), 400, /non-empty string/],
      ['a selector that is not a string', () => ({ waitForSelector: ['#pdf-ready'] }), 400, /non-empty string/],
    ])('answers %s with its status', async (_, body, status, message) => {
      await request(app).post('/pdf').send(body())
        .expect('Content-Type', /application\/json/)
        .expect(status)
        .expect((res) => {
          expect(res.body.status).toBe('error')
          expect(res.body.message).toMatch(message)
        })
    })

    it('stays healthy and keeps printing afterwards', async () => {
      await request(app).get('/health').expect(200)
      const content: string = await downloadPDF((req) => req.get('/pdf'))
      testBlankPDFContent(content)
    })
  })

  describe('waitForSelector', () => {
    // like a single-page app: renders after load, three pages tall, and only then adds #pdf-ready
    const lateMs = 1500
    const lateHtml = `<body><p>loading</p><script>
      setTimeout(() => {
        document.body.innerHTML = '<div style="height: 25in">rendered</div><div id="pdf-ready"></div>'
      }, ${lateMs})
    </script></body>`
    const spa = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(lateHtml)
    })
    const spaUrl = () => `http://127.0.0.1:${(spa.address() as AddressInfo).port}/`
    beforeAll(() => new Promise<void>((resolve) => { spa.listen(0, '127.0.0.1', resolve) }))
    afterAll(() => {
      spa.closeAllConnections()
      spa.close()
    })

    // Skia writes one uncompressed /Type /Page dictionary per page
    const pageCount = (content: string) => content.match(/\/Type \/Page\b/g)?.length ?? 0

    it('prints right away when the selector is already there', async () => {
      const body = { html: '<p id="pdf-ready">ready</p>', waitForSelector: '#pdf-ready' }
      const content: string = await downloadPDF((req) => req.post('/pdf').send(body))
      testPDFContent(content)
      expect(pageCount(content)).toBe(1)
    })

    it('prints html before the app rendered without it', async () => {
      const content: string = await downloadPDF((req) => req.post('/pdf').send({ html: lateHtml }))
      expect(pageCount(content)).toBe(1)
    })

    it('waits for an element a script adds later to html', async () => {
      const start = Date.now()
      const body = { html: lateHtml, waitForSelector: '#pdf-ready' }
      const content: string = await downloadPDF((req) => req.post('/pdf').send(body))
      expect(Date.now() - start).toBeGreaterThanOrEqual(lateMs)
      expect(pageCount(content)).toBe(3)
    })

    it('waits for an element a script adds later to a url', async () => {
      const body = { url: spaUrl(), waitUntil: ['load'], waitForSelector: '#pdf-ready' }
      const content: string = await downloadPDF((req) => req.post('/pdf').send(body))
      expect(pageCount(content)).toBe(3)
    })

    it('takes the selector as a query parameter of GET /pdf', async () => {
      const query = new URLSearchParams({ url: spaUrl(), waitForSelector: '#pdf-ready' })
      const content: string = await downloadPDF((req) => req.get(`/pdf?${query}`))
      expect(pageCount(content)).toBe(3)
    })

    it('takes the selector as a query parameter of GET /screenshot', async () => {
      const query = new URLSearchParams({ url: spaUrl(), waitForSelector: '#pdf-ready' })
      await request(app).get(`/screenshot?${query}`)
        .expect('Content-Type', /image\/png/)
        .expect(200)
      await request(app).get(`/screenshot?${new URLSearchParams({ url: spaUrl(), waitForSelector: '#' })}`)
        .expect('Content-Type', /application\/json/)
        .expect(400)
    })

    it('waits for the selector on POST /screenshot', async () => {
      await request(app).post('/screenshot').send({ html: lateHtml, waitForSelector: '#pdf-ready' })
        .expect('Content-Type', /image\/png/)
        .expect(200)
    })
  })

  it('/selfcheck should return ok', async () => {
    await request(app).get('/selfcheck')
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toStrictEqual({ status: 'ok' })
      })
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
