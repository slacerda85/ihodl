const env = (key: string, fallback: string): string => {
  const value = process.env[key]
  if (typeof value === 'string') return value
  return fallback
}

const parseBoolean = (value: string): boolean => value.trim().toLowerCase() === 'true'

export const LIGHTNING_WORKER_ENABLED = parseBoolean(
  env('EXPO_PUBLIC_LIGHTNING_WORKER_ENABLED', 'true'),
)

export function isLightningWorkerEnabled(): boolean {
  return LIGHTNING_WORKER_ENABLED
}
