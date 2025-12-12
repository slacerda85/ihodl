import { useEffect, useRef, useState, useCallback } from 'react'
import {
  WorkerService,
  type WorkerInitStatus,
  type WorkerReadiness,
  type WorkerMetrics,
} from '@/core/services/ln-worker-service'
import { lightningStore } from '../features/lightning/store'

export interface LightningWorkerSnapshot {
  status: WorkerInitStatus
  readiness: WorkerReadiness
  metrics: WorkerMetrics
}

export interface UseLightningWorkerOptions {
  walletId?: string
  masterKey?: Uint8Array
  autoStart?: boolean
}

const INITIAL_STATUS: WorkerInitStatus = { phase: 'idle', progress: 0, message: 'Not started' }
const INITIAL_READINESS: WorkerReadiness = {
  walletLoaded: false,
  electrumReady: false,
  transportConnected: false,
  peerConnected: false,
  channelsReestablished: false,
  gossipSynced: false,
  watcherRunning: false,
}

export function useLightningStartupWorker(options: UseLightningWorkerOptions) {
  const { walletId, masterKey, autoStart = true } = options
  const workerRef = useRef<WorkerService | null>(null)
  const [status, setStatus] = useState<WorkerInitStatus>(INITIAL_STATUS)
  const [readiness, setReadiness] = useState<WorkerReadiness>(INITIAL_READINESS)
  const [metrics, setMetrics] = useState<WorkerMetrics>({})

  useEffect(() => {
    if (!walletId || !masterKey) return

    const worker = new WorkerService()
    workerRef.current = worker

    const handleStatus = (nextStatus: WorkerInitStatus) => {
      setStatus(nextStatus)
      lightningStore.actions.setWorkerStatus(nextStatus)
    }

    const handleReadiness = (nextReadiness: WorkerReadiness) => {
      setReadiness(nextReadiness)
      lightningStore.actions.syncWorkerReadiness(nextReadiness)
    }

    const handleMetrics = (nextMetrics: WorkerMetrics) => {
      setMetrics(prev => ({ ...prev, ...nextMetrics }))
      lightningStore.actions.setWorkerMetrics(nextMetrics)
    }

    worker.on('status', handleStatus)
    worker.on('readiness', handleReadiness)
    worker.on('metrics', handleMetrics)

    const startIfNeeded = async () => {
      if (!autoStart) return
      await worker.initialize(masterKey, walletId)
    }

    startIfNeeded()

    return () => {
      worker.off('status', handleStatus)
      worker.off('readiness', handleReadiness)
      worker.off('metrics', handleMetrics)
      void worker.stop()
      workerRef.current = null
      lightningStore.actions.resetForWalletChange()
      setStatus(INITIAL_STATUS)
      setReadiness(INITIAL_READINESS)
      setMetrics({})
    }
  }, [autoStart, masterKey, walletId])

  const start = useCallback(async () => {
    const current = workerRef.current
    if (!current || !walletId || !masterKey) {
      return { success: false, error: 'Missing wallet or key' }
    }
    return current.initialize(masterKey, walletId)
  }, [masterKey, walletId])

  const stop = useCallback(async () => {
    const current = workerRef.current
    if (!current) return
    await current.stop()
  }, [])

  const getWorker = useCallback(() => workerRef.current, [])

  return {
    getWorker,
    status,
    readiness,
    metrics,
    start,
    stop,
  }
}
