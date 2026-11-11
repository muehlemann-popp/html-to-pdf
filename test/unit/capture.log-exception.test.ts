/* eslint-disable no-console */
import {
  describe, expect, it, vi,
} from 'vitest'
import { logException } from '~/controller/capture'

describe('logException', () => {
  it('return promise with exact same value', async () => {
    const promise = async () => 42

    expect(await logException('test', promise)).toBe(42)
  })

  it('logs when promise throws', async () => {
    const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const promise = async () => { throw new Error('test') }

    await expect(logException('test', promise)).rejects.toEqual(new Error('test'))
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Exception at test: "test"/))
    consoleErrorMock.mockRestore()
  })

  it('keeps credentials and query strings of URLs out of the log, not out of the error', async () => {
    const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('net::ERR_NAME_NOT_RESOLVED at https://u:p@host.invalid/a?token=secret')

    await expect(logException('page.goto', async () => { throw error })).rejects.toBe(error)
    expect(console.error).toHaveBeenCalledWith(expect.not.stringMatching(/secret|u:p/))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('https://host.invalid/a?…'))
    expect(error.message).toContain('token=secret')
    consoleErrorMock.mockRestore()
  })
})
