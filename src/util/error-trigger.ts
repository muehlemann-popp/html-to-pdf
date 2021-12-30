let trigger = false

export const checkUnrecoverableError = (): boolean => trigger

export const registerUnrecoverableError = (): void => {
  trigger = true
}
