import { describe, expect, it } from 'vitest'
import { CaptureMime, screenshotMime } from '~/interface'

describe('screenshotMime', () => {
  it.each([
    ['jpeg', CaptureMime.JPG],
    ['webp', CaptureMime.WEBP],
    ['png', CaptureMime.PNG],
    [undefined, CaptureMime.PNG],
    ['gif', CaptureMime.PNG],
    [5, CaptureMime.PNG],
  ])('maps type %j to %s', (type, mime) => {
    expect(screenshotMime(type)).toBe(mime)
  })
})
