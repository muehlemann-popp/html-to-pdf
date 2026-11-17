import {
  afterEach, describe, expect, it, vi,
} from 'vitest'
import { intFromEnv } from '~/util/env'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('intFromEnv', () => {
  it.each([
    ['5', 1, 5],
    ['100', 1, 100],
    ['0', 0, 0],
    [undefined, 1, 8],
    ['', 1, 8],
    ['0', 1, 8],
    ['-3', 1, 8],
    ['1.5', 1, 8],
    ['abc', 1, 8],
    ['10ms', 1, 8],
  ])('reads %j with a minimum of %i as %i (the fallback is 8)', (raw, min, expected) => {
    if (raw === undefined) {
      vi.stubEnv('X_TEST_VALUE', undefined)
    } else {
      vi.stubEnv('X_TEST_VALUE', raw)
    }
    expect(intFromEnv('X_TEST_VALUE', 8, min)).toBe(expected)
  })
})
