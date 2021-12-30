import puppeteer from 'puppeteer'
import { mocked } from 'ts-jest/utils'
import capture, { defaultViewportOptions } from '~/controller/capture'
import { CaptureType } from '~/interface'

const nil = null
const pageProto = {
  setContent: jest.fn().mockResolvedValue(nil),
  setDefaultNavigationTimeout: jest.fn().mockResolvedValue(nil),
  goto: jest.fn().mockResolvedValue(nil),
  waitForNavigation: jest.fn().mockResolvedValue(nil),
  evaluateHandle: jest.fn().mockResolvedValue(nil),
  setViewport: jest.fn().mockResolvedValue(nil),
  pdf: jest.fn().mockResolvedValue(nil),
  screenshot: jest.fn().mockResolvedValue(nil),
  close: jest.fn().mockResolvedValue(nil),
}

const browserProto = {
  newPage: jest.fn().mockResolvedValue(pageProto),
  close: jest.fn().mockResolvedValue(nil),
}

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockImplementation(async () => browserProto),
}))

beforeEach(() => {
  mocked(puppeteer.launch).mockClear()
  Object.values(pageProto).forEach((v) => v.mockClear())
  Object.values(browserProto).forEach((v) => v.mockClear())
})

describe('capture', () => {
  it('prints blank page if no params', async () => {
    await capture(CaptureType.PDF, {})
    expect(puppeteer.launch).toHaveBeenCalled()
    expect(pageProto.setContent).not.toHaveBeenCalled()
    expect(pageProto.evaluateHandle).toHaveBeenCalledWith('document.fonts.ready')
    expect(pageProto.goto).toHaveBeenCalledWith('about:blank', { waitUntil: ['load'] })
    expect(pageProto.pdf).toHaveBeenCalled()
    expect(pageProto.close).toHaveBeenCalled()
    expect(browserProto.close).toHaveBeenCalled()
  })

  it('prints html content', async () => {
    await capture(CaptureType.PDF, { html: '<html />' })
    expect(puppeteer.launch).toHaveBeenCalled()
    expect(pageProto.setContent).toHaveBeenCalledWith('<html />')
    expect(pageProto.waitForNavigation).toHaveBeenCalledWith({ waitUntil: ['load'] })
    expect(pageProto.goto).not.toHaveBeenCalled()
    expect(pageProto.evaluateHandle).toHaveBeenCalledWith('document.fonts.ready')
    expect(pageProto.pdf).toHaveBeenCalled()
    expect(pageProto.close).toHaveBeenCalled()
    expect(browserProto.close).toHaveBeenCalled()
  })

  it('uses defaults as expected', async () => {
    await capture(CaptureType.PDF, {})
    expect(pageProto.pdf).toHaveBeenCalledWith({
      margin: {
        bottom: '0',
        left: '0',
        right: '0',
        top: '0',
      },
      preferCSSPageSize: true,
      printBackground: true,
    })
    expect(pageProto.screenshot).not.toHaveBeenCalled()
  })

  it('uses defaults as expected', async () => {
    await capture(CaptureType.Screenshot, {})
    expect(pageProto.setViewport).toHaveBeenCalledWith(defaultViewportOptions)
    expect(pageProto.screenshot).toHaveBeenCalledWith({ encoding: 'binary' })
    expect(pageProto.pdf).not.toHaveBeenCalled()
  })
})
