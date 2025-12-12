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
 * @returns Estatísticas da sincronização quando completa
 */
export function useBackgroundSyncStats(): {
  nodesCount: number
  channelsCount: number
  syncDuration: number
  isAvailable: boolean
} | null {
  const { state } = useBackgroundGossipSync()

  // Retornar estatísticas mockadas quando sincronização estiver completa
  if (state === BackgroundSyncState.COMPLETED) {
    return {
      nodesCount: 15000, // Exemplo
      channelsCount: 45000, // Exemplo
      syncDuration: 1800000, // 30 minutos em ms
      isAvailable: true,
    }
  }

  return null
}
