import { intFromEnv } from '~/util/env'
import { TargetError } from '~/util/target-error'

/**
 A screenshot larger than Chromium can capture does not fail cleanly: depending on its size and on the
 sandbox, Chromium answers "Unable to capture screenshot", "Page is too large." or its renderer dies
 ("Target closed"), which looks like a broken browser, takes the retry and then makes the process exit.
 Measured on Chromium 156 (2026-11-17), without and with the sandbox: 16384 × 16384 px and smaller worked,
 20000 × 20000 px and larger failed, from 24000 × 24000 px (and a fullPage screenshot of 2400 × 200000 px)
 by killing the renderer. Larger screenshots are therefore answered with 400 before Chromium tries.
*/
export const maxScreenshotPixels = intFromEnv('MAX_SCREENSHOT_PIXELS', 16384 * 16384, 1)

// throws a 400 TargetError when an image of width × height CSS pixels at `scale` has too many pixels
export const checkScreenshotSize = (what: string, width: number, height: number, scale: number): void => {
  const pixelWidth = width * scale
  const pixelHeight = height * scale
  // NaN (an option Chromium will reject itself) is not compared as too large
  if (pixelWidth * pixelHeight > maxScreenshotPixels) {
    throw new TargetError(
      `the screenshot is too large: ${what} is ${Math.ceil(pixelWidth)} × ${Math.ceil(pixelHeight)} px,`
        + ` at most ${maxScreenshotPixels} px (MAX_SCREENSHOT_PIXELS) are captured`,
      400,
    )
  }
}
