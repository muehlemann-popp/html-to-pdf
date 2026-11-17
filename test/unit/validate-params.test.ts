import { describe, expect, it } from 'vitest'
import { TargetError } from '~/util/target-error'
import { validateParams } from '~/util/validate-params'

const messageOf = (params: unknown): string | null => {
  try {
    validateParams(params)
    return null
  } catch (e) {
    expect(e).toBeInstanceOf(TargetError)
    expect((e as TargetError).status).toBe(400)
    return (e as TargetError).message
  }
}

describe('validateParams', () => {
  it.each([
    {},
    { url: 'https://example.com' },
    { html: '', waitUntil: [] },
    { html: '<p>x</p>', waitUntil: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'] },
    { html: null, waitUntil: null, viewport: null, pdfOptions: null, screenshotOptions: null },
    { viewport: { width: 800, height: 600, deviceScaleFactor: 2, isMobile: true, hasTouch: false } },
    { viewport: { width: 800 } },
    { pdfOptions: { format: 'A4', printBackground: true, scale: 0.5, timeout: 0 } },
    { pdfOptions: { width: '210mm', height: 297, margin: { top: '10mm', left: 12, right: '1in', bottom: '96' } } },
    { pdfOptions: { format: '', width: '5cm' } },
    { screenshotOptions: { type: 'jpeg', quality: 50, emulateMediaType: 'print', fullPage: true } },
    { screenshotOptions: { type: 'webp', quality: 0 } },
    { screenshotOptions: { clip: { x: 0, y: 0, width: 5, height: 5 }, emulateMediaType: '' } },
  ])('accepts %j', (params) => {
    expect(messageOf(params)).toBeNull()
  })

  // each of these made puppeteer throw a plain Error, which took the retry and made the process exit
  it.each([
    [[], /JSON object/],
    ['text', /JSON object/],
    [null, /JSON object/],
    [{ html: 123 }, /html must be a string/],
    [{ html: {} }, /html must be a string/],
    [{ html: true }, /html must be a string/],
    [{ waitUntil: 'load' }, /waitUntil must be an array/],
    [{ waitUntil: ['bogus'] }, /waitUntil must be an array/],
    [{ waitUntil: [1] }, /waitUntil must be an array/],
    [{ viewport: 'x' }, /viewport must be an object/],
    [{ viewport: [] }, /viewport must be an object/],
    [{ viewport: { width: 1.5 } }, /viewport.width/],
    [{ viewport: { height: '100' } }, /viewport.height/],
    [{ viewport: { width: -5 } }, /viewport.width/],
    [{ viewport: { width: 0 } }, /viewport.width/],
    [{ viewport: { deviceScaleFactor: 0 } }, /deviceScaleFactor/],
    [{ viewport: { isMobile: 'yes' } }, /viewport.isMobile/],
    [{ pdfOptions: 'a4' }, /pdfOptions must be an object/],
    [{ pdfOptions: { format: 'bogus' } }, /pdfOptions.format/],
    [{ pdfOptions: { format: 5 } }, /pdfOptions.format/],
    [{ pdfOptions: { format: 'constructor' } }, /pdfOptions.format/],
    [{ pdfOptions: { width: 'abc' } }, /pdfOptions.width/],
    [{ pdfOptions: { height: null } }, /pdfOptions.height/],
    [{ pdfOptions: { width: {} } }, /pdfOptions.width/],
    [{ pdfOptions: { margin: 'x' } }, /pdfOptions.margin must be an object/],
    [{ pdfOptions: { margin: { top: 'zz' } } }, /pdfOptions.margin.top/],
    [{ pdfOptions: { margin: { left: null } } }, /pdfOptions.margin.left/],
    [{ pdfOptions: { scale: 99 } }, /pdfOptions.scale/],
    [{ pdfOptions: { scale: 0.01 } }, /pdfOptions.scale/],
    [{ pdfOptions: { scale: 'abc' } }, /pdfOptions.scale/],
    [{ pdfOptions: { timeout: 'abc' } }, /pdfOptions.timeout/],
    [{ pdfOptions: { timeout: -1 } }, /pdfOptions.timeout/],
    [{ screenshotOptions: 'x' }, /screenshotOptions must be an object/],
    [{ screenshotOptions: { type: 'gif' } }, /screenshotOptions.type/],
    [{ screenshotOptions: { type: 5 } }, /screenshotOptions.type/],
    [{ screenshotOptions: { type: 'jpeg', quality: 101 } }, /quality must be a number between 0 and 100/],
    [{ screenshotOptions: { type: 'jpeg', quality: 'x' } }, /quality must be a number between 0 and 100/],
    [{ screenshotOptions: { quality: 50 } }, /quality needs/],
    [{ screenshotOptions: { type: 'png', quality: 50 } }, /quality needs/],
    [{ screenshotOptions: { clip: 'x' } }, /clip must be an object/],
    [{ screenshotOptions: { clip: { x: 0, y: 0, width: -1, height: 5 } } }, /clip must be/],
    [{ screenshotOptions: { clip: { x: 0, y: 0, width: 5 } } }, /clip must be/],
    [{ screenshotOptions: { clip: { x: 0, y: 0, width: 5, height: 5 }, fullPage: true } }, /mutually exclusive/],
    [{ screenshotOptions: { emulateMediaType: 'foo' } }, /emulateMediaType/],
    [{ screenshotOptions: { emulateMediaType: 5 } }, /emulateMediaType/],
  ])('rejects %j with a 400', (params, message) => {
    expect(messageOf(params)).toMatch(message)
  })
})
