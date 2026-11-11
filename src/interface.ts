import {
  PDFOptions, ScreenshotOptions, Viewport, PuppeteerLifeCycleEvent,
} from 'puppeteer'

export enum CaptureType {
  Screenshot,
  PDF,
}

export enum CaptureMime {
  PNG = 'image/png',
  PDF = 'application/pdf',
  JPG = 'image/jpeg',
  WEBP = 'image/webp',
}

// the Content-Type of a screenshot of the requested `screenshotOptions.type`, png when none
export const screenshotMime = (type: unknown): CaptureMime => {
  switch (type) {
    case 'jpeg':
      return CaptureMime.JPG
    case 'webp':
      return CaptureMime.WEBP
    default:
      return CaptureMime.PNG
  }
}

export interface CustomScreenshotOptions {
  emulateMediaType?: string
}

export interface CaptureParameters {
  url?: string,
  html?: string,
  pdfOptions?: PDFOptions,
  screenshotOptions?: ScreenshotOptions & CustomScreenshotOptions,
  viewport?: Viewport,
  waitUntil?: PuppeteerLifeCycleEvent[]
  waitForSelector?: string
  timeout?: number
}
