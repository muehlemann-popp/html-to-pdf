import { Response } from 'express'
import { CaptureMime, CaptureParameters, CaptureType } from '~/interface'
import capture from '~/controller/capture'
import { registerUnrecoverableError } from '~/util/error-trigger'
import { TargetError } from '~/util/target-error'
import timestamp from '~/util/timestamp'
import { logRequestTime, processRequestError } from '~/util/log-request'

const mimeToExtension: Record<CaptureMime, string> = {
  [CaptureMime.PDF]: 'pdf',
  [CaptureMime.JPG]: 'jpg',
  [CaptureMime.PNG]: 'png',
}

const captureAndReturn = async (
  res: Response,
  type: CaptureType,
  mime: CaptureMime,
  fileName: string,
  params: CaptureParameters,
): Promise<void> => {
  const paramsString: string = JSON.stringify(params, (key, value) => {
    // html part of the request will definitely be too long to log it
    if (key === 'html' && typeof value === 'string' && value.length > 10) {
      return `${value.substr(0, 10)}… [${value.length}]`
    }
    return value
  })
  const requestInfo = `Capture ${CaptureType[type]} with params ${paramsString}`
  try {
    await processRequestError(requestInfo, res, true, async () => {
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
        // retry once again, if it throws again, it will raise
        await logRequestTime(`Retry: ${requestInfo}`, true, captureAndProcess)
      }
    })
  } catch (e) {
    // already answered with its status by processRequestError, the service itself is fine
    if (e instanceof TargetError) {
      return
    }
    // eslint-disable-next-line no-console
    console.error(e)
    registerUnrecoverableError()
    // it failed twice, we better exit now and restart node process
    // eslint-disable-next-line no-console
    console.info(`[${timestamp()}] Exiting due to unrecoverable error`)
    process.exit(1)
  }
}

export default captureAndReturn
