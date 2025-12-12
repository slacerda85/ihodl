import { useLightningState } from './useLightningState'
import type {
  WorkerInitStatus,
  WorkerMetrics,
  WorkerReadiness,
} from '@/core/services/ln-worker-service'

export interface LightningDebugSnapshot {
  workerStatus?: WorkerInitStatus
  workerReadiness?: WorkerReadiness
  workerMetrics?: WorkerMetrics
  initStatus: string
  readinessState: any
  readinessLevel: any
  channels: number
  invoices: number
  payments: number
  connection: any
}

export function useLightningDebugSnapshot(): LightningDebugSnapshot {
  const state = useLightningState() as any

  return {
    workerStatus: state.workerStatus,
    workerReadiness: state.workerReadiness,
    workerMetrics: state.workerMetrics,
    initStatus: state.initStatus,
    readinessState: state.readinessState,
    readinessLevel: state.readinessLevel,
    channels: state.channels?.length ?? 0,
    invoices: state.invoices?.length ?? 0,
    payments: state.payments?.length ?? 0,
    connection: state.connection,
  }
}
