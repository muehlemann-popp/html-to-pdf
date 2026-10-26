import { Request, Response, Router } from 'express'
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

// express 5 leaves req.body undefined when the request has no JSON body, express 4 made it {}
const bodyParams = (req: Request): CaptureParameters => req.body ?? {}

/**
 * Generate PDF from an url via GET
 */
router.get('/pdf', async (req: Request, res: Response) => {
  const params: CaptureParameters = {
    url: req.query?.url as string || defaultUrl,
  }
  const sent = await captureAndReturn(
    res,
    CaptureType.PDF,
    CaptureMime.PDF,
    req.query?.filename as string || pdfDefaultName,
    params,
  )
  if (sent) {
    pdfCounter.inc({ method: 'get' })
  }
})

/**
 * Generate PDF from an url or html via POST
 */
router.post('/pdf', async (req: Request, res: Response) => {
  const sent = await captureAndReturn(
    res,
    CaptureType.PDF,
    CaptureMime.PDF,
    req.query?.filename as string || pdfDefaultName,
    bodyParams(req),
  )
  if (sent) {
    pdfCounter.inc({ method: 'post' })
  }
})

/**
 * Generate screenshot from an url via GET
 */
router.get('/screenshot', async (req: Request, res: Response) => {
  const params: CaptureParameters = {
    url: req.query?.url as string || defaultUrl,
  }
  const sent = await captureAndReturn(
    res,
    CaptureType.Screenshot,
    CaptureMime.PNG,
    req.query?.filename as string || screenshotDefaultName,
    params,
  )
  if (sent) {
    screenshotCounter.inc({ method: 'get' })
  }
})

/**
 * Generate screenshot from an url or html via POST
 */
router.post('/screenshot', async (req: Request, res: Response) => {
  const sent = await captureAndReturn(
    res,
    CaptureType.Screenshot,
    bodyParams(req).screenshotOptions?.type === 'jpeg' ? CaptureMime.JPG : CaptureMime.PNG,
    req.query?.filename as string || screenshotDefaultName,
    bodyParams(req),
  )
  if (sent) {
    screenshotCounter.inc({ method: 'post' })
  }
})

/**
 * Print readme, rendered at build time (scripts/readme-html.mjs)
 */
router.get('/', async (req: Request, res: Response) => {
  await logRequest('/', res, false, async () => {
    res.status(200).type('html').send(README_HTML)
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
    const pdfStr = Buffer.from(buffer).toString('latin1')

    // Chromium's PDF writer is Skia, /Creator has been the user agent string since Chromium ~120
    const ok = pdfStr.startsWith('%PDF-1.')
      && pdfStr.includes('/Producer (Skia/PDF')
      && pdfStr.trimEnd().endsWith('%%EOF')

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
router.get('/favicon.ico', (req: Request, res: Response) => {
  res.sendFile('favicon.ico', { root: '.' })
})

/**
 * Catch all, 404
 */
router.get('/{*splat}', async (req: Request, res: Response) => {
  await logRequest(`404: ${req.path}`, res, false, async () => {
    res.status(404).send({
      error: `not found: ${req.path}`,
    })
  })
})

export default router
