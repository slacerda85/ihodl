import { useCallback, useSyncExternalStore } from 'react'
import {
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
  /**
   * @deprecated Auto-start foi removido. A inicialização é gerenciada pelo AppProvider.
   * @see docs/lightning-worker-consolidation-plan.md - Fase 2.2
   */
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

/**
 * Hook para observar o status do Lightning Worker.
 *
 * IMPORTANTE: Este hook NÃO inicia automaticamente o worker.
 * A inicialização é gerenciada centralmente pelo AppProvider.
 * Use `lightningStore.actions.initialize()` para iniciar manualmente se necessário.
 *
 * @see docs/lightning-worker-consolidation-plan.md - Fase 2.2
 */
export function useLightningStartupWorker(options: UseLightningWorkerOptions = {}) {
  const { walletId } = options

  // Emit warning se autoStart for passado (deprecated)
  if (__DEV__ && options.autoStart !== undefined) {
    console.warn(
      '[useLightningStartupWorker] autoStart is deprecated. Initialization is managed by AppProvider.',
    )
  }

  const snapshot = useSyncExternalStore(
    lightningStore.subscribe,
    lightningStore.getSnapshot,
    lightningStore.getSnapshot,
  )

  const status = snapshot.workerStatus ?? INITIAL_STATUS
  const readiness = snapshot.workerReadiness ?? INITIAL_READINESS
  const metrics = snapshot.workerMetrics ?? {}

  // REMOVIDO: useEffect com autoStart - inicialização centralizada no AppProvider

  const start = useCallback(async () => {
    if (!walletId) {
      return { success: false, error: 'Missing walletId' }
    }
    await lightningStore.actions.initialize()
    return { success: true }
  }, [walletId])

  const stop = useCallback(async () => {
    const worker = lightningStore.actions.getWorker()
    await worker.stop()
  }, [])

  const getWorker = useCallback(() => lightningStore.actions.getWorker(), [])

  return {
    getWorker,
    status,
    readiness,
    metrics,
    start,
    stop,
  }
}
