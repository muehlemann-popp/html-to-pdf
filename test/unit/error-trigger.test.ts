import { checkUnrecoverableError, registerUnrecoverableError } from '~/util/error-trigger'

describe('Error trigger is persisted', () => {
  it('check unrecoverable error', async () => {
    expect(checkUnrecoverableError()).toBeFalsy()
    registerUnrecoverableError()
    expect(checkUnrecoverableError()).toBeTruthy()
    // second call is still ok
    expect(checkUnrecoverableError()).toBeTruthy()
    // registering again does not reset it to false
    registerUnrecoverableError()
    expect(checkUnrecoverableError()).toBeTruthy()
  })
})
