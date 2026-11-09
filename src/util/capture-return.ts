import { Response } from 'express'
import { CaptureMime, CaptureParameters, CaptureType } from '~/interface'
import capture from '~/controller/capture'
import { CaptureRejectedError, captureSlots } from '~/controller/capture-slots'
import { CaptureOutcome, captureDuration } from '~/controller/metrics'
import { registerUnrecoverableError } from '~/util/error-trigger'
import { TargetError, toRetriedTargetError } from '~/util/target-error'
import timestamp from '~/util/timestamp'
import { logRequestTime, processRequestError } from '~/util/log-request'

const mimeToExtension: Record<CaptureMime, string> = {
  [CaptureMime.PDF]: 'pdf',
  [CaptureMime.JPG]: 'jpg',
  [CaptureMime.PNG]: 'png',
}

// resolves true once the capture was sent, false when the request was answered with an error
const captureAndReturn = async (
  res: Response,
  type: CaptureType,
  mime: CaptureMime,
  fileName: string,
  params: CaptureParameters,
): Promise<boolean> => {
  const paramsString: string = JSON.stringify(params, (key, value) => {
    // html part of the request will definitely be too long to log it
    if (key === 'html' && typeof value === 'string' && value.length > 10) {
      return `${value.substr(0, 10)}… [${value.length}]`
    }
    return value
  })
  const requestInfo = `Capture ${CaptureType[type]} with params ${paramsString}`
  const started = performance.now()
  const observe = (outcome: CaptureOutcome) => captureDuration.observe(
    { type: CaptureType[type].toLowerCase(), outcome },
    (performance.now() - started) / 1000,
  )
  // a client that hangs up while its capture is still queued gives up its place in the queue
  const hangUp = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) {
      hangUp.abort()
    }
  })
  try {
    // one slot for the capture and its retry, waiting in the queue first if all slots are busy
    await processRequestError(requestInfo, res, true, () => captureSlots.run(async () => {
      const captureAndProcess = async () => {
        const result = await capture(type, params)
        res.attachment(`${fileName}.${mimeToExtension[mime]}`)
        res.contentType(mime)
        // express only sends a Buffer as binary, a plain Uint8Array would be serialised as JSON
        res.status(200).send(Buffer.from(result.buffer, result.byteOffset, result.byteLength))
      }

      try {
        // try once
        await logRequestTime(requestInfo, true, captureAndProcess)
      } catch (e) {
        // the requested page failed (bad URL, unreachable, timeout), a retry would fail the same way
        if (e instanceof TargetError) {
          throw e
        }
        // retry once on a fresh browser, if it throws again, it will raise
        try {
          await logRequestTime(`Retry: ${requestInfo}`, true, captureAndProcess)
        } catch (retryError) {
          throw toRetriedTargetError(retryError)
        }
      }
    }, hangUp.signal))
    observe('ok')
    return true
  } catch (e) {
    // already answered with its status by processRequestError, the service itself is fine
    // (a rejected capture never ran, so it is not retried either)
    if (e instanceof TargetError) {
      observe('target_error')
      return false
    }
    if (e instanceof CaptureRejectedError) {
      observe('rejected')
      return false
    }
    observe('service_error')
    // eslint-disable-next-line no-console
    console.error(e)
    registerUnrecoverableError()
    // it failed twice, we better exit now and restart node process
    // eslint-disable-next-line no-console
    console.info(`[${timestamp()}] Exiting due to unrecoverable error`)
    return process.exit(1)
  }
}

export default captureAndReturn
