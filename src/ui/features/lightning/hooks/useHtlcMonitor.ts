/**
 * useHtlcMonitor Hook
 *
 * Hook React para monitorar HTLCs pendentes e seu status on-chain.
 * Este hook fornece uma interface simplificada para gerenciar HTLCs
 * no nível da UI, mantendo estado próprio sincronizado com o monitor core.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { HtlcMonitorState, HtlcAction } from '@/core/lib/lightning'

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
 */
export function useHtlcMonitor(config: HtlcMonitorConfig): UseHtlcMonitorReturn {
  const [state, setState] = useState<HtlcMonitorHookState>(initialState)
  const [blockHeight, setBlockHeight] = useState(config.currentBlockHeight)

  // Refs para estado interno
  const htlcsMapRef = useRef<Map<string, MonitoredHtlcInfo>>(new Map())
  const preimagesRef = useRef<Map<string, string>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /**
   * Calcula informações de monitoramento para um HTLC
   */
  const calculateHtlcInfo = useCallback(
    (htlc: HtlcToMonitor, preimage?: string): MonitoredHtlcInfo => {
      const blocksUntilExpiry = htlc.cltvExpiry - blockHeight
      const urgency = getUrgency(blocksUntilExpiry)

      // Determinar estado baseado em blocos restantes
      let htlcState = HtlcMonitorState.PENDING
      if (blocksUntilExpiry <= 0) {
        htlcState = HtlcMonitorState.EXPIRED
      }

      // Determinar ação recomendada
      let action = HtlcAction.NONE
      const safetyMargin = config.safetyMarginBlocks ?? DEFAULT_SAFETY_MARGIN
      if (blocksUntilExpiry <= safetyMargin) {
        if (htlc.direction === 'received' && preimage) {
          action = HtlcAction.PUBLISH_SUCCESS
        } else if (htlc.direction === 'sent') {
          action = HtlcAction.PUBLISH_TIMEOUT
        }
      }

      return {
        id: `${htlc.channelId}:${htlc.htlcId}`,
        htlcId: htlc.htlcId,
        channelId: htlc.channelId,
        paymentHash: htlc.paymentHash,
        amountSat: Number(htlc.amountMsat / 1000n),
        cltvExpiry: htlc.cltvExpiry,
        direction: htlc.direction,
        state: htlcState,
        recommendedAction: action,
        urgency,
        blocksUntilExpiry,
        preimage,
        statusMessage: getStatusMessage(htlcState, blocksUntilExpiry),
      }
    },
    [blockHeight, config.safetyMarginBlocks],
  )

  /**
   * Atualiza lista de HTLCs no estado
   */
  const updateState = useCallback(() => {
    const htlcs = Array.from(htlcsMapRef.current.values())
    setState(prev => ({
      ...prev,
      htlcs,
    }))
  }, [])

  /**
   * Adiciona HTLC para monitorar
   */
  const addHtlc = useCallback(
    (htlc: HtlcToMonitor) => {
      const key = `${htlc.channelId}:${htlc.htlcId}`
      const preimage = preimagesRef.current.get(htlc.paymentHash)
      const info = calculateHtlcInfo(htlc, preimage)
      htlcsMapRef.current.set(key, info)
      updateState()
    },
    [calculateHtlcInfo, updateState],
  )

  /**
   * Remove HTLC do monitoramento
   */
  const removeHtlc = useCallback(
    (channelId: string, htlcId: string) => {
      const key = `${channelId}:${htlcId}`
      htlcsMapRef.current.delete(key)
      updateState()
    },
    [updateState],
  )

  /**
   * Registra preimage conhecida
   */
  const registerPreimage = useCallback(
    (paymentHashHex: string, preimageHex: string) => {
      preimagesRef.current.set(paymentHashHex, preimageHex)

      // Atualizar HTLCs que usam este payment hash
      for (const [key, htlc] of htlcsMapRef.current.entries()) {
        if (htlc.paymentHash === paymentHashHex) {
          htlcsMapRef.current.set(key, {
            ...htlc,
            preimage: preimageHex,
            recommendedAction:
              htlc.direction === 'received' ? HtlcAction.PUBLISH_SUCCESS : htlc.recommendedAction,
          })
        }
      }
      updateState()
    },
    [updateState],
  )

  /**
   * Força verificação imediata
   */
  const checkNow = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      // Atualizar altura do bloco se callback disponível
      let newHeight = blockHeight
      if (config.fetchBlockHeight) {
        newHeight = await config.fetchBlockHeight()
        setBlockHeight(newHeight)
      }

      // Recalcular todos os HTLCs com nova altura
      for (const [key, htlc] of htlcsMapRef.current.entries()) {
        const blocksUntilExpiry = htlc.cltvExpiry - newHeight
        const urgency = getUrgency(blocksUntilExpiry)

        htlcsMapRef.current.set(key, {
          ...htlc,
          blocksUntilExpiry,
          urgency,
          state: blocksUntilExpiry <= 0 ? HtlcMonitorState.EXPIRED : htlc.state,
          statusMessage: getStatusMessage(
            blocksUntilExpiry <= 0 ? HtlcMonitorState.EXPIRED : htlc.state,
            blocksUntilExpiry,
          ),
        })
      }

      updateState()

      setState(prev => ({
        ...prev,
        loading: false,
        lastCheckAt: Date.now(),
        nextCheckAt: prev.isMonitoring
          ? Date.now() + (config.checkIntervalMs || DEFAULT_CHECK_INTERVAL)
          : null,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Erro ao verificar HTLCs',
      }))
    }
  }, [blockHeight, config, updateState])

  /**
   * Inicia monitoramento automático
   */
  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return

    const interval = config.checkIntervalMs || DEFAULT_CHECK_INTERVAL

    intervalRef.current = setInterval(() => {
      checkNow()
    }, interval)

    setState(prev => ({
      ...prev,
      isMonitoring: true,
      nextCheckAt: Date.now() + interval,
    }))

    // Verificar imediatamente
    checkNow()
  }, [config.checkIntervalMs, checkNow])

  /**
   * Para monitoramento automático
   */
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    setState(prev => ({
      ...prev,
      isMonitoring: false,
      nextCheckAt: null,
    }))
  }, [])

  /**
   * Retorna HTLCs urgentes (ordenados por urgência)
   */
  const getUrgentHtlcs = useCallback((): MonitoredHtlcInfo[] => {
    return state.htlcs
      .filter(htlc => htlc.urgency !== 'low')
      .sort((a, b) => a.blocksUntilExpiry - b.blocksUntilExpiry)
  }, [state.htlcs])

  /**
   * Retorna HTLCs com ação pendente
   */
  const getActionableHtlcs = useCallback((): MonitoredHtlcInfo[] => {
    return state.htlcs.filter(htlc => htlc.recommendedAction !== HtlcAction.NONE)
  }, [state.htlcs])

  /**
   * Atualiza altura do bloco
   */
  const updateBlockHeight = useCallback((height: number) => {
    setBlockHeight(height)
    // Recalcular HTLCs será feito no próximo checkNow
  }, [])

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

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

/**
 * Calcula urgência baseada nos blocos até expirar
 */
function getUrgency(blocksUntilExpiry: number): MonitoredHtlcInfo['urgency'] {
  if (blocksUntilExpiry <= URGENCY_THRESHOLDS.critical) return 'critical'
  if (blocksUntilExpiry <= URGENCY_THRESHOLDS.high) return 'high'
  if (blocksUntilExpiry <= URGENCY_THRESHOLDS.medium) return 'medium'
  return 'low'
}

/**
 * Gera mensagem de status
 */
function getStatusMessage(monitorState: HtlcMonitorState, blocksUntilExpiry: number): string {
  switch (monitorState) {
    case HtlcMonitorState.PENDING:
      return `Aguardando no commitment (${blocksUntilExpiry} blocos até expirar)`
    case HtlcMonitorState.ONCHAIN:
      return 'Commitment publicado on-chain'
    case HtlcMonitorState.HTLC_TX_PUBLISHED:
      return 'HTLC TX publicada, aguardando confirmação'
    case HtlcMonitorState.RESOLVED:
      return 'HTLC resolvido com sucesso'
    case HtlcMonitorState.EXPIRED:
      return 'HTLC expirou'
    case HtlcMonitorState.ERROR:
      return 'Erro no monitoramento'
    default:
      return 'Estado desconhecido'
  }
}

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
