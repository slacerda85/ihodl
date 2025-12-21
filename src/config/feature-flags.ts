const parseBoolean = (value: string): boolean => value.trim().toLowerCase() === 'true'

export const LIGHTNING_WORKER_ENABLED = parseBoolean(process.env.LIGHTNING_WORKER_ENABLED ?? 'true')

export function isLightningWorkerEnabled(): boolean {
  return LIGHTNING_WORKER_ENABLED
}
