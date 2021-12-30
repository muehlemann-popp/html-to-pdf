/* eslint-disable no-console */
import { logException } from '~/controller/capture'

describe('logException', () => {
  it('return promise with exact same value', async () => {
    const promise = async () => 42

    expect(await logException('test', promise)).toBe(42)
  })

  it('logs when promise throws', async () => {
    const consoleErrorMock = jest.spyOn(console, 'error').mockImplementation()
    const promise = async () => { throw new Error('test') }

    await expect(logException('test', promise)).rejects.toEqual(new Error('test'))
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Exception at test: "test"/))
    consoleErrorMock.mockRestore()
  })
})
