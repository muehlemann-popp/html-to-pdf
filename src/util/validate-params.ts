import { TargetError } from '~/util/target-error'

/**
 The request body is handed to puppeteer almost as it is, and puppeteer rejects what it cannot use with
 a plain `Error` (`Unknown paper format`, `Unknown value for options.waitUntil`, `g.filter is not a
 function`, …). Such an error is not the caller's page failing, so it would be taken for a service
 failure: retried, then the process exits, taking every other request in flight with it. The shape of
 every option that puppeteer itself throws on is therefore checked before a browser is used, and
 answered with 400. What only Chromium rejects (a `scale` out of range, …) is mapped by
 `toOptionsError` in ~/util/target-error, see README "Errors".
*/

function reject(message: string): never {
  throw new TargetError(message, 400)
}

type Options = Record<string, unknown>

const isObject = (value: unknown): value is Options => typeof value === 'object' && value !== null
  && !Array.isArray(value)

// an optional option that has to be an object; null counts as not given, as it does for the defaults
const optionalObject = (name: string, value: unknown): Options | undefined => {
  if (value === undefined || value === null) {
    return undefined
  }
  if (!isObject(value)) {
    return reject(`${name} must be an object`)
  }
  return value
}

const lifecycleEvents = new Set(['load', 'domcontentloaded', 'networkidle0', 'networkidle2'])

// puppeteer's paperFormats
const paperFormats = new Set([
  'letter', 'legal', 'tabloid', 'ledger', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6',
])

const lengthUnits = new Set(['px', 'in', 'cm', 'mm'])

const screenshotTypes = new Set(['png', 'jpeg', 'webp'])

const mediaTypes = new Set(['screen', 'print'])

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

// a paper size or margin as puppeteer parses it: a number of pixels, or a string like "10mm", "1in", "96"
const checkLength = (name: string, value: unknown): void => {
  if (value === undefined) {
    return
  }
  if (isFiniteNumber(value)) {
    return
  }
  if (typeof value === 'string') {
    const unit = value.slice(-2).toLowerCase()
    if (!Number.isNaN(Number(lengthUnits.has(unit) ? value.slice(0, -2) : value))) {
      return
    }
  }
  reject(`${name} must be a number of pixels or a length such as "10mm" (units: px, in, cm, mm)`)
}

const checkPdfOptions = (value: unknown): void => {
  const pdfOptions = optionalObject('pdfOptions', value)
  if (!pdfOptions) {
    return
  }
  const { format, margin } = pdfOptions
  if (format && (typeof format !== 'string' || !paperFormats.has(format.toLowerCase()))) {
    reject(`pdfOptions.format must be one of ${[...paperFormats].join(', ')}`)
  }
  const { timeout, scale } = pdfOptions
  if (timeout !== undefined && (!isFiniteNumber(timeout) || timeout < 0)) {
    reject('pdfOptions.timeout must be a non-negative number of milliseconds')
  }
  if (scale !== undefined && (!isFiniteNumber(scale) || scale < 0.1 || scale > 2)) {
    reject('pdfOptions.scale must be a number between 0.1 and 2')
  }
  checkLength('pdfOptions.width', pdfOptions.width)
  checkLength('pdfOptions.height', pdfOptions.height)
  if (margin !== undefined && margin !== null) {
    if (!isObject(margin)) {
      reject('pdfOptions.margin must be an object with top, right, bottom and left')
    }
    ;(['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
      checkLength(`pdfOptions.margin.${side}`, (margin as Options)[side])
    })
  }
}

const checkScreenshotOptions = (value: unknown): void => {
  const options = optionalObject('screenshotOptions', value)
  if (!options) {
    return
  }
  const { type, quality, clip } = options
  if (type !== undefined && (typeof type !== 'string' || !screenshotTypes.has(type))) {
    reject(`screenshotOptions.type must be one of ${[...screenshotTypes].join(', ')}`)
  }
  if (quality !== undefined) {
    if (!isFiniteNumber(quality) || quality < 0 || quality > 100) {
      reject('screenshotOptions.quality must be a number between 0 and 100')
    }
    if (type !== 'jpeg' && type !== 'webp') {
      reject('screenshotOptions.quality needs screenshotOptions.type jpeg or webp')
    }
  }
  if (clip !== undefined) {
    const box = optionalObject('screenshotOptions.clip', clip)
    if (!box || !['x', 'y', 'width', 'height'].every((key) => isFiniteNumber(box[key]))
      || (box.width as number) <= 0 || (box.height as number) <= 0) {
      reject('screenshotOptions.clip must be {x, y, width, height} with a positive width and height')
    }
    if (options.fullPage) {
      reject('screenshotOptions.clip and screenshotOptions.fullPage are mutually exclusive')
    }
  }
  const { emulateMediaType } = options
  if (emulateMediaType && (typeof emulateMediaType !== 'string' || !mediaTypes.has(emulateMediaType))) {
    reject('screenshotOptions.emulateMediaType must be screen or print')
  }
}

const checkViewport = (value: unknown): void => {
  const viewport = optionalObject('viewport', value)
  if (!viewport) {
    return
  }
  ;(['width', 'height'] as const).forEach((key) => {
    const size = viewport[key]
    if (size !== undefined && (!Number.isInteger(size) || (size as number) <= 0)) {
      reject(`viewport.${key} must be a positive integer`)
    }
  })
  const { deviceScaleFactor } = viewport
  if (deviceScaleFactor !== undefined && (!isFiniteNumber(deviceScaleFactor) || deviceScaleFactor <= 0)) {
    reject('viewport.deviceScaleFactor must be a positive number')
  }
  ;(['isMobile', 'hasTouch', 'isLandscape'] as const).forEach((key) => {
    if (viewport[key] !== undefined && typeof viewport[key] !== 'boolean') {
      reject(`viewport.${key} must be true or false`)
    }
  })
}

/**
 Throws a 400 `TargetError` for a request whose options puppeteer would throw on. `url`, `waitForSelector`
 and `timeout` are checked where they are used (~/controller/capture, ~/util/url-guard).
*/
export const validateParams = (params: unknown): void => {
  if (!isObject(params)) {
    reject('the request body must be a JSON object')
  }
  const {
    html, waitUntil, viewport, pdfOptions, screenshotOptions,
  } = params as Options
  if (html !== undefined && html !== null && typeof html !== 'string') {
    reject('html must be a string')
  }
  if (waitUntil !== undefined && waitUntil !== null) {
    if (!Array.isArray(waitUntil) || waitUntil.some((event) => !lifecycleEvents.has(event))) {
      reject(`waitUntil must be an array of ${[...lifecycleEvents].join(', ')}`)
    }
  }
  checkViewport(viewport)
  checkPdfOptions(pdfOptions)
  checkScreenshotOptions(screenshotOptions)
}
