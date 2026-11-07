// an integer environment variable of at least `min`; unset, empty or anything else gives the fallback
export const intFromEnv = (name: string, fallback: number, min: number): number => {
  const raw = process.env[name]
  const value = Number(raw)
  return raw && Number.isInteger(value) && value >= min ? value : fallback
}
