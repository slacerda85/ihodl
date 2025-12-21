/**
 * Hook para Background Gossip Sync
 *
 * Hook React para monitorar o estado da sincronização de gossip em background
 * no modo híbrido (trampoline + gossip).
 */

import { useEffect, useState } from 'react'
import { BackgroundSyncState, type SyncProgress } from '@/core/services/ln-worker-service'
import { useWorkerService } from './useWorkerService'

/**
 * Hook para acessar o estado da sincronização em background
 *
 * @returns Estado atual da sincronização em background
 */
export function useBackgroundGossipSync(): {
  state: BackgroundSyncState
  isCompleted: boolean
  isSyncing: boolean
  progress?: SyncProgress
  service: ReturnType<typeof useWorkerService>
} {
  const service = useWorkerService()
  const [state, setState] = useState<BackgroundSyncState>(() => service.getBackgroundSyncState())
  const [progress, setProgress] = useState<SyncProgress | undefined>(() =>
    service.getBackgroundSyncProgress(),
  )

  useEffect(() => {
    const handleStateChanged = (newState: BackgroundSyncState) => {
      setState(newState)
    }

    const handleProgressUpdated = (newProgress?: SyncProgress) => {
      setProgress(newProgress)
    }

    service.on('backgroundSyncState', handleStateChanged)
    service.on('backgroundSyncProgress', handleProgressUpdated)

    return () => {
      service.off('backgroundSyncState', handleStateChanged)
      service.off('backgroundSyncProgress', handleProgressUpdated)
    }
  }, [service])

  return {
    state,
    isCompleted: state === BackgroundSyncState.COMPLETED,
    isSyncing: state === BackgroundSyncState.SYNCING,
    progress,
    service,
  }
}

/**
 * Hook para estatísticas da sincronização
 *
 * @returns Estatísticas da sincronização em tempo real
 */
export function useBackgroundSyncStats(): {
  nodesCount: number
  channelsCount: number
  syncDuration: number
  isAvailable: boolean
} | null {
  const { state, progress } = useBackgroundGossipSync()

  // Retornar estatísticas reais baseadas no progresso
  if (state === BackgroundSyncState.COMPLETED || state === BackgroundSyncState.SYNCING) {
    return {
      nodesCount: progress?.nodesDiscovered ?? 0,
      channelsCount: progress?.channelsDiscovered ?? 0,
      syncDuration: 0, // TODO: Track actual duration in WorkerService
      isAvailable: true,
    }
  }

  return null
}
