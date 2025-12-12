/**
 * useChannelBackup - Hook para gerenciamento de backup de canais Lightning
 *
 * Fornece funções para criar, exportar, importar e restaurar backups de canais.
 * Baseado em Static Channel Backup (SCB) format.
 */

import { useState, useCallback } from 'react'
import {
  ChannelBackupData,
  FullBackup,
  RestoreContext,
  RestoreState,
  RestoreSummary,
  exportEncryptedBackup,
  importEncryptedBackup,
  exportSingleChannelBackup,
  importSingleChannelBackup,
  validateChannelBackup,
  getBackupChecksum,
  prepareChannelRestore,
  createRestoreSummary,
  CHANNEL_BACKUP_VERSION,
} from '@/core/lib/lightning/backup'
import { useLightningState } from '@/ui/features/app-provider'

// ==========================================
// TYPES
// ==========================================

export interface BackupState {
  /** Backup atual em memória */
  currentBackup: FullBackup | null
  /** Último checksum do backup */
  lastChecksum: string | null
  /** Timestamp da última criação de backup */
  lastBackupTime: number | null
  /** Se há mudanças não salvas */
  hasUnsavedChanges: boolean
  /** Contextos de restauração ativos */
  restoreContexts: RestoreContext[]
  /** Resumo de restauração */
  restoreSummary: RestoreSummary | null
}

export interface BackupOperationResult {
  success: boolean
  error?: string
  data?: string
}

export interface RestoreOperationResult {
  success: boolean
  error?: string
  channelsRestored: number
  summary?: RestoreSummary
}

// ==========================================
// HOOK
// ==========================================

export function useChannelBackup() {
  const lightningState = useLightningState()

  const [backupState, setBackupState] = useState<BackupState>({
    currentBackup: null,
    lastChecksum: null,
    lastBackupTime: null,
    hasUnsavedChanges: false,
    restoreContexts: [],
    restoreSummary: null,
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Cria backup de todos os canais ativos
   */
  const createBackup = useCallback(async (): Promise<FullBackup | null> => {
    setIsLoading(true)
    setError(null)

    try {
      // Obter canais do estado Lightning
      const channels = lightningState.channels || []

      if (channels.length === 0) {
        setError('Nenhum canal para fazer backup')
        return null
      }

      // Converter canais para formato de backup
      const channelBackups: ChannelBackupData[] = []

      for (const channel of channels) {
        // TODO: Obter secrets do secure storage
        // Por enquanto, usar placeholders
        const backup: ChannelBackupData = {
          channelId: channel.channelId,
          nodeId: channel.peerId || '',
          fundingTxid: '', // Obter do canal completo
          fundingOutputIndex: 0,
          channelSeed: '', // Obter do secure storage
          localPrivkey: '', // Obter do secure storage
          isInitiator: true,
          localDelay: 144,
          remoteDelay: 144,
          remotePaymentPubkey: channel.peerId || '',
          remoteRevocationPubkey: channel.peerId || '',
          host: 'localhost', // Obter do peer manager
          port: 9735,
          createdAt: Date.now(),
        }

        const validation = validateChannelBackup(backup)
        if (validation.valid) {
          channelBackups.push(backup)
        } else {
          console.warn(`Canal ${channel.channelId} inválido para backup:`, validation.errors)
        }
      }

      const fullBackup: FullBackup = {
        version: CHANNEL_BACKUP_VERSION,
        createdAt: Date.now(),
        channels: channelBackups,
      }

      const checksum = getBackupChecksum(fullBackup)

      setBackupState(prev => ({
        ...prev,
        currentBackup: fullBackup,
        lastChecksum: checksum,
        lastBackupTime: Date.now(),
        hasUnsavedChanges: false,
      }))

      return fullBackup
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar backup'
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [lightningState.channels])

  /**
   * Exporta backup como string encriptada
   */
  const exportBackup = useCallback(
    async (password: string): Promise<BackupOperationResult> => {
      setIsLoading(true)
      setError(null)

      try {
        // Criar backup se não existe
        let backup = backupState.currentBackup
        if (!backup) {
          backup = await createBackup()
          if (!backup) {
            return { success: false, error: 'Falha ao criar backup' }
          }
        }

        if (backup.channels.length === 0) {
          return { success: false, error: 'Nenhum canal para exportar' }
        }

        const encryptedData = exportEncryptedBackup(backup, password)

        return { success: true, data: encryptedData }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao exportar backup'
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsLoading(false)
      }
    },
    [backupState.currentBackup, createBackup],
  )

  /**
   * Importa backup de string encriptada
   */
  const importBackup = useCallback(
    async (data: string, password: string): Promise<BackupOperationResult> => {
      setIsLoading(true)
      setError(null)

      try {
        const backup = importEncryptedBackup(data, password)

        if (backup.channels.length === 0) {
          return { success: false, error: 'Backup não contém canais' }
        }

        // Validar cada canal
        const validChannels: ChannelBackupData[] = []
        const errors: string[] = []

        for (const channel of backup.channels) {
          const validation = validateChannelBackup(channel)
          if (validation.valid) {
            validChannels.push(channel)
          } else {
            errors.push(`Canal ${channel.channelId}: ${validation.errors.join(', ')}`)
          }
        }

        if (validChannels.length === 0) {
          return {
            success: false,
            error: `Nenhum canal válido no backup. Erros: ${errors.join('; ')}`,
          }
        }

        const validBackup: FullBackup = {
          ...backup,
          channels: validChannels,
        }

        const checksum = getBackupChecksum(validBackup)

        setBackupState(prev => ({
          ...prev,
          currentBackup: validBackup,
          lastChecksum: checksum,
          lastBackupTime: Date.now(),
          hasUnsavedChanges: false,
        }))

        return {
          success: true,
          data: `Importados ${validChannels.length} canais${errors.length > 0 ? ` (${errors.length} inválidos)` : ''}`,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao importar backup'
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  /**
   * Exporta backup de canal único
   */
  const exportSingleChannel = useCallback(
    async (channelId: string, password: string): Promise<BackupOperationResult> => {
      setIsLoading(true)
      setError(null)

      try {
        const channel = backupState.currentBackup?.channels.find(c => c.channelId === channelId)

        if (!channel) {
          return { success: false, error: 'Canal não encontrado no backup' }
        }

        const encryptedData = exportSingleChannelBackup(channel, password)
        return { success: true, data: encryptedData }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao exportar canal'
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsLoading(false)
      }
    },
    [backupState.currentBackup],
  )

  /**
   * Importa backup de canal único
   */
  const importSingleChannel = useCallback(
    async (data: string, password: string): Promise<BackupOperationResult> => {
      setIsLoading(true)
      setError(null)

      try {
        const channel = importSingleChannelBackup(data, password)

        const validation = validateChannelBackup(channel)
        if (!validation.valid) {
          return { success: false, error: `Canal inválido: ${validation.errors.join(', ')}` }
        }

        // Adicionar ao backup atual
        setBackupState(prev => {
          const existingChannels = prev.currentBackup?.channels || []
          const filteredChannels = existingChannels.filter(c => c.channelId !== channel.channelId)

          const updatedBackup: FullBackup = {
            version: CHANNEL_BACKUP_VERSION,
            createdAt: Date.now(),
            channels: [...filteredChannels, channel],
          }

          return {
            ...prev,
            currentBackup: updatedBackup,
            hasUnsavedChanges: true,
          }
        })

        return { success: true, data: `Canal ${channel.channelId} importado` }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao importar canal'
        setError(message)
        return { success: false, error: message }
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  /**
   * Inicia restauração de canais do backup
   */
  const startRestore = useCallback(async (): Promise<RestoreOperationResult> => {
    setIsLoading(true)
    setError(null)

    try {
      if (!backupState.currentBackup || backupState.currentBackup.channels.length === 0) {
        return {
          success: false,
          error: 'Nenhum backup disponível para restaurar',
          channelsRestored: 0,
        }
      }

      // Preparar contexto de restauração para cada canal
      const contexts: RestoreContext[] = backupState.currentBackup.channels.map(channel =>
        prepareChannelRestore(channel),
      )

      const validContexts = contexts.filter(c => c.state !== RestoreState.FAILED)

      if (validContexts.length === 0) {
        const errors = contexts
          .filter(c => c.state === RestoreState.FAILED)
          .map(c => c.error)
          .join('; ')
        return {
          success: false,
          error: `Todos os canais inválidos: ${errors}`,
          channelsRestored: 0,
        }
      }

      const summary = createRestoreSummary(contexts)

      setBackupState(prev => ({
        ...prev,
        restoreContexts: contexts,
        restoreSummary: summary,
      }))

      // TODO: Iniciar processo de reconexão e restore real
      // Isso envolve:
      // 1. Conectar a cada peer
      // 2. Enviar channel_reestablish com commitment = 0
      // 3. Peer faz force-close
      // 4. Monitorar blockchain para sweep

      return {
        success: true,
        channelsRestored: validContexts.length,
        summary,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar restauração'
      setError(message)
      return { success: false, error: message, channelsRestored: 0 }
    } finally {
      setIsLoading(false)
    }
  }, [backupState.currentBackup])

  /**
   * Atualiza estado de restauração de um canal
   */
  const updateRestoreState = useCallback(
    (channelId: string, newState: RestoreState, error?: string, closingTxid?: string) => {
      setBackupState(prev => {
        const updatedContexts = prev.restoreContexts.map(ctx => {
          if (ctx.backup.channelId === channelId) {
            return {
              ...ctx,
              state: newState,
              error,
              closingTxid,
              attempts: ctx.attempts + 1,
              lastAttempt: Date.now(),
            }
          }
          return ctx
        })

        return {
          ...prev,
          restoreContexts: updatedContexts,
          restoreSummary: createRestoreSummary(updatedContexts),
        }
      })
    },
    [],
  )

  /**
   * Limpa estado de backup
   */
  const clearBackup = useCallback(() => {
    setBackupState({
      currentBackup: null,
      lastChecksum: null,
      lastBackupTime: null,
      hasUnsavedChanges: false,
      restoreContexts: [],
      restoreSummary: null,
    })
    setError(null)
  }, [])

  /**
   * Verifica se backup está atualizado com canais atuais
   */
  const checkBackupStatus = useCallback(() => {
    const currentChannels = lightningState.channels || []
    const backupChannels = backupState.currentBackup?.channels || []

    const currentIds = new Set(currentChannels.map(c => c.channelId))
    const backupIds = new Set(backupChannels.map(c => c.channelId))

    const missingFromBackup = currentChannels.filter(c => !backupIds.has(c.channelId))
    const removedChannels = backupChannels.filter(c => !currentIds.has(c.channelId))

    return {
      isUpToDate: missingFromBackup.length === 0 && removedChannels.length === 0,
      missingFromBackup: missingFromBackup.map(c => c.channelId),
      removedChannels: removedChannels.map(c => c.channelId),
      backupAge: backupState.lastBackupTime ? Date.now() - backupState.lastBackupTime : null,
    }
  }, [lightningState.channels, backupState.currentBackup, backupState.lastBackupTime])

  return {
    // State
    backupState,
    isLoading,
    error,

    // Backup operations
    createBackup,
    exportBackup,
    importBackup,
    exportSingleChannel,
    importSingleChannel,

    // Restore operations
    startRestore,
    updateRestoreState,

    // Utilities
    clearBackup,
    checkBackupStatus,
  }
}

export default useChannelBackup
