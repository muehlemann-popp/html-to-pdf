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
  timeout?: number
}
