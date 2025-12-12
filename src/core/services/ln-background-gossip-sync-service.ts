/**
 * Background Gossip Sync (Deprecated)
 *
 * Responsabilidade movida para o WorkerService. Este módulo permanece apenas
 * para compatibilidade de tipos e para evitar importações quebradas.
 */

import EventEmitter from 'eventemitter3'
import type { SyncProgress } from '../lib/lightning/gossip-sync'

export enum BackgroundSyncState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  SYNCING = 'syncing',
  COMPLETED = 'completed',
  ERROR = 'error',
  PAUSED = 'paused',
}

export interface BackgroundSyncEvents {
  stateChanged: (state: BackgroundSyncState) => void
  progressUpdated: (progress: SyncProgress) => void
  syncCompleted: (stats: { nodes: number; channels: number; duration: number }) => void
  syncError: (error: Error) => void
}

export type BackgroundGossipSyncService = EventEmitter<BackgroundSyncEvents> & {
  getState(): BackgroundSyncState
  isSyncCompleted(): boolean
  isSyncing(): boolean
  startBackgroundSync(): Promise<void>
  stopBackgroundSync(): Promise<void>
}

let backgroundSyncInstance: BackgroundGossipSyncService | null = null

export function getBackgroundGossipSyncService(): BackgroundGossipSyncService {
  if (backgroundSyncInstance) {
    return backgroundSyncInstance
  }

  const emitter = new EventEmitter<BackgroundSyncEvents>() as BackgroundGossipSyncService

  emitter.getState = () => BackgroundSyncState.IDLE
  emitter.isSyncCompleted = () => false
  emitter.isSyncing = () => false
  emitter.startBackgroundSync = async () => {
    console.warn(
      '[BackgroundGossipSync] Deprecated: background sync is now managed by WorkerService',
    )
  }
  emitter.stopBackgroundSync = async () => undefined

  backgroundSyncInstance = emitter
  return backgroundSyncInstance
}

export { EventEmitter }
export type { SyncProgress }
