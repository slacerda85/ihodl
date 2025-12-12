/**
 * useHtlcMonitor Hook
 *
 * Hook React para monitorar HTLCs pendentes e seu status on-chain.
 * Agora delega para o LightningMonitorService através do WorkerService,
 * eliminando duplicação de código e seguindo a arquitetura correta.
 */

import { useState, useCallback, useEffect } from 'react'
import { HtlcMonitorState, HtlcAction } from '@/core/services/ln-htlc-service'
import { useWorkerService } from './useWorkerService'

// ============================================================================
// Tipos
// ============================================================================

/**
 * Estado do hook
 */
export interface HtlcMonitorHookState {
  /** Lista de HTLCs sendo monitorados */
  htlcs: MonitoredHtlcInfo[]
  /** Carregando */
  loading: boolean
  /** Erro atual */
  error: string | null
  /** Última verificação */
  lastCheckAt: number | null
  /** Próxima verificação agendada */
  nextCheckAt: number | null
  /** Monitor ativo */
  isMonitoring: boolean
}

/**
 * Informações de HTLC monitorado (UI-friendly)
 */
export interface MonitoredHtlcInfo {
  /** ID único (channelId:htlcId) */
  id: string
  /** ID do HTLC no canal */
  htlcId: string
  /** ID do canal */
  channelId: string
  /** Payment hash (hex) */
  paymentHash: string
  /** Valor em satoshis */
  amountSat: number
  /** CLTV expiry */
  cltvExpiry: number
  /** Direção */
  direction: 'sent' | 'received'
  /** Estado atual */
  state: HtlcMonitorState
  /** Ação recomendada */
  recommendedAction: HtlcAction
  /** Urgência (baseada no CLTV) */
  urgency: 'low' | 'medium' | 'high' | 'critical'
  /** Blocos até expirar */
  blocksUntilExpiry: number
  /** Txid se publicado on-chain */
  txid?: string
  /** Preimage se conhecido */
  preimage?: string
  /** Mensagem de status */
  statusMessage: string
}

/**
 * Configuração do monitor
 */
export interface HtlcMonitorConfig {
  /** Intervalo de verificação (ms) */
  checkIntervalMs?: number
  /** Altura atual do bloco */
  currentBlockHeight: number
  /** Callback para buscar altura do bloco */
  fetchBlockHeight?: () => Promise<number>
  /** Margem de segurança em blocos antes do CLTV */
  safetyMarginBlocks?: number
}

/**
 * Dados de HTLC para adicionar ao monitor
 */
export interface HtlcToMonitor {
  htlcId: string
  channelId: string
  paymentHash: string
  amountMsat: bigint
  cltvExpiry: number
  direction: 'sent' | 'received'
}

/**
 * Retorno do hook
 */
export interface UseHtlcMonitorReturn {
  /** Estado atual */
  state: HtlcMonitorHookState
  /** Adiciona HTLC para monitorar */
  addHtlc: (htlc: HtlcToMonitor) => void
  /** Remove HTLC do monitoramento */
  removeHtlc: (channelId: string, htlcId: string) => void
  /** Registra preimage conhecida */
  registerPreimage: (paymentHashHex: string, preimageHex: string) => void
  /** Força verificação imediata */
  checkNow: () => Promise<void>
  /** Inicia monitoramento automático */
  startMonitoring: () => void
  /** Para monitoramento automático */
  stopMonitoring: () => void
  /** Lista HTLCs por urgência */
  getUrgentHtlcs: () => MonitoredHtlcInfo[]
  /** Lista HTLCs com ação pendente */
  getActionableHtlcs: () => MonitoredHtlcInfo[]
  /** Atualiza altura do bloco */
  updateBlockHeight: (height: number) => void
}

// ============================================================================
// Constantes
// ============================================================================

/** Intervalo padrão de verificação (30 segundos) */
export const DEFAULT_CHECK_INTERVAL = 30000

/** Margem de segurança padrão (6 blocos = ~1 hora) */
export const DEFAULT_SAFETY_MARGIN = 6

/** Limites de urgência em blocos */
export const URGENCY_THRESHOLDS = {
  critical: 3, // < 3 blocos = crítico
  high: 6, // < 6 blocos = alto
  medium: 18, // < 18 blocos = médio
  // > 18 blocos = baixo
}

// ============================================================================
// Estado Inicial
// ============================================================================

const initialState: HtlcMonitorHookState = {
  htlcs: [],
  loading: false,
  error: null,
  lastCheckAt: null,
  nextCheckAt: null,
  isMonitoring: false,
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook para monitorar HTLCs pendentes
 *
 * Delega para o LightningMonitorService através do WorkerService,
 * mantendo a mesma interface pública para compatibilidade.
 */
export function useHtlcMonitor(config: HtlcMonitorConfig): UseHtlcMonitorReturn {
  const workerService = useWorkerService()
  const [state, setState] = useState<HtlcMonitorHookState>(initialState)

  // Obter o serviço de monitoramento
  const monitorService = workerService.getLightningMonitorService()

  /**
   * Inicia monitoramento automático
   */
  const startMonitoring = useCallback(async () => {
    if (!monitorService) {
      setState(prev => ({ ...prev, error: 'Lightning monitor service not available' }))
      return
    }

    try {
      await workerService.startLightningMonitoring()
      setState(prev => ({ ...prev, isMonitoring: true, error: null }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start monitoring',
      }))
    }
  }, [workerService, monitorService])

  /**
   * Para monitoramento automático
   */
  const stopMonitoring = useCallback(async () => {
    if (!monitorService) return

    try {
      await workerService.stopLightningMonitoring()
      setState(prev => ({ ...prev, isMonitoring: false, error: null }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to stop monitoring',
      }))
    }
  }, [workerService, monitorService])

  /**
   * Força verificação imediata
   */
  const checkNow = useCallback(async () => {
    if (!monitorService) {
      setState(prev => ({ ...prev, error: 'Lightning monitor service not available' }))
      return
    }

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      await workerService.checkHtlcsNow()
      setState(prev => ({
        ...prev,
        loading: false,
        lastCheckAt: Date.now(),
        // TODO: Map alerts to HTLC info for UI
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to check HTLCs',
      }))
    }
  }, [workerService, monitorService])

  /**
   * Adiciona HTLC para monitorar
   * Nota: Esta funcionalidade pode precisar ser implementada no serviço
   */
  const addHtlc = useCallback((htlc: HtlcToMonitor) => {
    // TODO: Implementar no LightningMonitorService se necessário
    console.log('Add HTLC monitoring:', htlc)
  }, [])

  /**
   * Remove HTLC do monitoramento
   * Nota: Esta funcionalidade pode precisar ser implementada no serviço
   */
  const removeHtlc = useCallback((channelId: string, htlcId: string) => {
    // TODO: Implementar no LightningMonitorService se necessário
    console.log('Remove HTLC monitoring:', channelId, htlcId)
  }, [])

  /**
   * Registra preimage conhecida
   * Nota: Esta funcionalidade pode precisar ser implementada no serviço
   */
  const registerPreimage = useCallback((paymentHashHex: string, preimageHex: string) => {
    // TODO: Implementar no LightningMonitorService se necessário
    console.log('Register preimage:', paymentHashHex, preimageHex)
  }, [])

  /**
   * Retorna HTLCs urgentes (placeholder)
   */
  const getUrgentHtlcs = useCallback((): MonitoredHtlcInfo[] => {
    // TODO: Implementar mapeamento do status do serviço
    return []
  }, [])

  /**
   * Retorna HTLCs com ação pendente (placeholder)
   */
  const getActionableHtlcs = useCallback((): MonitoredHtlcInfo[] => {
    // TODO: Implementar mapeamento do status do serviço
    return []
  }, [])

  /**
   * Atualiza altura do bloco
   */
  const updateBlockHeight = useCallback((height: number) => {
    // TODO: Implementar atualização no serviço se necessário
    console.log('Update block height:', height)
  }, [])

  // Atualizar estado baseado no status do serviço
  useEffect(() => {
    if (!monitorService) return

    const updateStatus = () => {
      try {
        const status = workerService.getLightningMonitoringStatus()
        setState(prev => ({
          ...prev,
          isMonitoring: status.isMonitoring,
          lastCheckAt: status.lastHTLCCheck,
          // TODO: Map other status fields
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to get status',
        }))
      }
    }

    // Atualizar imediatamente
    updateStatus()

    // TODO: Configurar listener para atualizações do serviço
  }, [workerService, monitorService])

  return {
    state,
    addHtlc,
    removeHtlc,
    registerPreimage,
    checkNow,
    startMonitoring,
    stopMonitoring,
    getUrgentHtlcs,
    getActionableHtlcs,
    updateBlockHeight,
  }
}

// ============================================================================
// Utilitários
// ============================================================================

// ============================================================================
// Utilitários
// ============================================================================

/**
 * Formata tempo restante
 */
export function formatTimeRemaining(blocks: number): string {
  const minutes = blocks * 10 // ~10 min por bloco
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ${minutes % 60}min`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

/**
 * Retorna cor baseada na urgência
 */
export function getUrgencyColor(urgency: MonitoredHtlcInfo['urgency']): string {
  switch (urgency) {
    case 'critical':
      return '#F44336' // Red
    case 'high':
      return '#FF9800' // Orange
    case 'medium':
      return '#FFC107' // Yellow
    case 'low':
      return '#4CAF50' // Green
  }
}

/**
 * Retorna label da ação
 */
export function getActionLabel(action: HtlcAction): string {
  switch (action) {
    case HtlcAction.NONE:
      return 'Nenhuma'
    case HtlcAction.PUBLISH_SUCCESS:
      return 'Publicar HTLC-Success'
    case HtlcAction.PUBLISH_TIMEOUT:
      return 'Publicar HTLC-Timeout'
    case HtlcAction.SWEEP_HTLC_OUTPUT:
      return 'Fazer sweep do output'
    case HtlcAction.UPDATE_PREIMAGE:
      return 'Atualizar preimage'
    case HtlcAction.MARK_EXPIRED:
      return 'Marcar como expirado'
    default:
      return 'Desconhecida'
  }
}
