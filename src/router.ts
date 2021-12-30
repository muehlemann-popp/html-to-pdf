import express, { Request, Response, Router } from 'express'
import marked from 'marked'
import fs from 'fs'
import { register } from 'prom-client'
import { CaptureMime, CaptureParameters, CaptureType } from '~/interface'
import { pdfCounter, screenshotCounter } from '~/controller/metrics'
import captureAndReturn from '~/util/capture-return'
import capture, { defaultUrl } from '~/controller/capture'
import { checkUnrecoverableError } from '~/util/error-trigger'
import logRequest from '~/util/log-request'

const pdfDefaultName = 'booklet'
const screenshotDefaultName = 'screenshot'

const router = Router()

/**
 * Generate PDF from an url via GET
 */
router.get('/pdf', async (req: Request, res: Response) => {
  const params: CaptureParameters = {
    url: req.query?.url as string || defaultUrl,
  }
  await captureAndReturn(
    res,
    CaptureType.PDF,
    CaptureMime.PDF,
    req.query?.filename as string || pdfDefaultName,
    params,
  )
  pdfCounter.inc({ method: 'get' })
})

/**
 * Generate PDF from an url or html via POST
 */
router.post('/pdf', async (req: Request, res: Response) => {
  await captureAndReturn(
    res,
    CaptureType.PDF,
    CaptureMime.PDF,
    req.query?.filename as string || pdfDefaultName,
    req.body as CaptureParameters,
  )
  pdfCounter.inc({ method: 'post' })
})

/**
 * Generate screenshot from an url via GET
 */
router.get('/screenshot', async (req: Request, res: Response) => {
  const params: CaptureParameters = {
    url: req.query?.url as string || defaultUrl,
  }
  await captureAndReturn(
    res,
    CaptureType.Screenshot,
    CaptureMime.PNG,
    req.query?.filename as string || screenshotDefaultName,
    params,
  )
  screenshotCounter.inc({ method: 'get' })
})

/**
 * Generate screenshot from an url or html via POST
 */
router.post('/screenshot', async (req: Request, res: Response) => {
  await captureAndReturn(
    res,
    CaptureType.Screenshot,
    req.body.screenshotOptions?.type === 'jpeg' ? CaptureMime.JPG : CaptureMime.PNG,
    req.query?.filename as string || screenshotDefaultName,
    req.body as CaptureParameters,
  )
  screenshotCounter.inc({ method: 'post' })
})

/**
 * Print readme
 */
router.get('/', async (req: Request, res: Response) => {
  await logRequest('/', res, false, async () => {
    const content = marked(fs.readFileSync('README.md').toString())
    const css = 'https://cdn.jsdelivr.net/npm/bootswatch@4.5.2/dist/slate/bootstrap.min.css'
    const link = `<link rel="stylesheet" href="${css}" crossorigin="anonymous" />`
    res.status(200).send(`<html><head>${link}</head><body><div class="container p-5">${content}</div></body></html>`)
  })
})

/**
 * Can be used to check alive status
 */
router.get('/health', async (req: Request, res: Response) => {
  await logRequest('/health', res, false, async () => {
    if (checkUnrecoverableError()) {
      throw new Error('Unrecoverable error already happened')
    }
    res.status(200).json({ status: 'ok' })
  })
})

/**
 * Can be used to check readiness status
 */
router.get('/selfcheck', async (req: Request, res: Response) => {
  await logRequest('/selfcheck', res, false, async () => {
    const buffer = await capture(CaptureType.PDF, {
      html: '<html><body><p>test</p></body></html>',
      waitUntil: ['load'],
    })
    const pdfStr = buffer.toString()

    const ok = pdfStr.startsWith('%PDF-1.4')
      && pdfStr.includes('/Creator (Chromium)')
      && pdfStr.endsWith('%%EOF')

    if (!ok) {
      throw new Error('Printed page does not match expectations')
    }

    res.status(200).json({ status: 'ok' })
  })
})

/**
 * Can be used to check alive status
 */
router.get('/metrics', async (req: Request, res: Response) => {
  await logRequest('/metrics', res, false, async () => {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
  })
})

/**
 * Sentry test route
 */
router.get('/debug-sentry', () => {
  throw new Error('Test Sentry error')
})

/**
 * Version route
 */
router.get('/version', async (req: Request, res: Response) => {
  await logRequest('/version', res, false, async () => {
    res.send({
      releaseId: process.env.RELEASE_ID,
      buildDate: process.env.CI_BUILD_DATE,
      env: process.env.ENV,
    })
  })
})

/**
 * Favicon
 */
router.use('/favicon.ico', express.static('favicon.ico'))

/**
 * Catch all, 404
 */
router.get('*', async (req: Request, res: Response) => {
  await logRequest(`404: ${req.path}`, res, false, async () => {
    res.status(404).send({
      error: `not found: ${req.path}`,
    })
  })
})

export default router
