/**
 * Hook para Background Gossip Sync
 *
 * Hook React para monitorar o estado da sincronização de gossip em background
 * no modo híbrido (trampoline + gossip).
 */

import { useEffect, useState } from 'react'
import {
  getBackgroundGossipSyncService,
  BackgroundSyncState,
  type BackgroundGossipSyncService,
} from '@/core/services/ln-background-gossip-sync-service'
import { SyncProgress } from '@/core/lib/lightning/gossip-sync'

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
  service: BackgroundGossipSyncService
} {
  const service = getBackgroundGossipSyncService()
  const [state, setState] = useState<BackgroundSyncState>(() => service.getState())
  const [progress, setProgress] = useState<SyncProgress | undefined>()

  useEffect(() => {
    const handleStateChanged = (newState: BackgroundSyncState) => {
      setState(newState)
    }

    const handleProgressUpdated = (newProgress: SyncProgress) => {
      setProgress(newProgress)
    }

    service.on('stateChanged', handleStateChanged)
    service.on('progressUpdated', handleProgressUpdated)

    return () => {
      service.off('stateChanged', handleStateChanged)
      service.off('progressUpdated', handleProgressUpdated)
    }
  }, [service])

  return {
    state,
    isCompleted: service.isSyncCompleted(),
    isSyncing: service.isSyncing(),
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
