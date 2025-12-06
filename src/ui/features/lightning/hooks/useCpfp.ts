/**
 * useCpfp Hook
 *
 * Hook React para gerenciar CPFP (Child-Pays-For-Parent) fee bumping
 * de transações Lightning (commitment/HTLC transactions).
 *
 * Este hook fornece uma interface simplificada para cálculo de fee
 * e preparação de CPFP, delegando a construção real da TX para serviços.
 */

import { useState, useCallback } from 'react'

// ============================================================================
// Tipos
// ============================================================================

/**
 * Estado do CPFP
 */
export interface CpfpState {
  /** Carregando dados */
  loading: boolean
  /** Erro atual */
  error: string | null
  /** Cálculo de fee atual */
  feeCalculation: SimpleCpfpResult | null
  /** TX CPFP construída (hex) */
  cpfpTxHex: string | null
  /** Status da operação */
  status: CpfpStatus
  /** Transação parent sendo bumpada */
  parentTxid: string | null
  /** Fee rate alvo */
  targetFeeRate: number
}

/**
 * Resultado simplificado do cálculo CPFP
 */
export interface SimpleCpfpResult {
  /** Fee total necessária (parent + child) */
  totalFeeSat: number
  /** Fee necessária para o child */
  childFeeSat: number
  /** Fee rate efetiva do pacote */
  effectiveFeeRate: number
  /** Se é economicamente viável */
  isViable: boolean
}

/**
 * Status do CPFP
 */
export type CpfpStatus =
  | 'idle'
  | 'calculating'
  | 'ready'
  | 'building'
  | 'broadcasting'
  | 'success'
  | 'error'

/**
 * Parâmetros para cálculo de CPFP
 */
export interface CalculateCpfpParams {
  /** TXID da transação parent */
  parentTxid: string
  /** Tamanho da transação parent em vbytes */
  parentVsize: number
  /** Fee rate atual da parent em sat/vB */
  parentFeeRate: number
  /** Fee rate alvo em sat/vB */
  targetFeeRate: number
  /** Tamanho estimado da child em vbytes (opcional, usa default) */
  childVsize?: number
}

/**
 * Retorno do hook
 */
export interface UseCpfpReturn {
  /** Estado atual */
  state: CpfpState
  /** Calcula fee CPFP necessária */
  calculateFee: (params: CalculateCpfpParams) => SimpleCpfpResult | null
  /** Define TX CPFP (hex) quando construída externamente */
  setCpfpTx: (txHex: string) => void
  /** Broadcast da TX CPFP */
  broadcast: (broadcastFn: (txHex: string) => Promise<string>) => Promise<string | null>
  /** Reseta estado */
  reset: () => void
  /** Atualiza fee rate alvo */
  setTargetFeeRate: (rate: number) => void
}

// ============================================================================
// Constantes
// ============================================================================

/** Fee rate mínimo (1 sat/vB) */
export const MIN_FEE_RATE = 1

/** Fee rate máximo (500 sat/vB) */
export const MAX_FEE_RATE = 500

/** Tamanho típico de TX CPFP (1-in, 1-out P2WPKH) */
export const TYPICAL_CPFP_SIZE_VB = 110

// ============================================================================
// Estado inicial
// ============================================================================

const initialState: CpfpState = {
  loading: false,
  error: null,
  feeCalculation: null,
  cpfpTxHex: null,
  status: 'idle',
  parentTxid: null,
  targetFeeRate: 10,
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook para gerenciar CPFP fee bumping
 */
export function useCpfp(): UseCpfpReturn {
  const [state, setState] = useState<CpfpState>(initialState)

  /**
   * Calcula fee CPFP necessária (cálculo local simplificado)
   *
   * Para atingir target fee rate no pacote:
   * (parent_fee + child_fee) / (parent_vsize + child_vsize) >= target_rate
   *
   * Portanto:
   * child_fee >= target_rate * (parent_vsize + child_vsize) - parent_fee
   */
  const calculateFee = useCallback((params: CalculateCpfpParams): SimpleCpfpResult | null => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      status: 'calculating',
      parentTxid: params.parentTxid,
      targetFeeRate: params.targetFeeRate,
    }))

    try {
      // Validar parâmetros
      if (params.targetFeeRate < MIN_FEE_RATE) {
        throw new Error(`Fee rate mínimo: ${MIN_FEE_RATE} sat/vB`)
      }

      if (params.targetFeeRate > MAX_FEE_RATE) {
        throw new Error(`Fee rate máximo: ${MAX_FEE_RATE} sat/vB`)
      }

      if (params.targetFeeRate <= params.parentFeeRate) {
        throw new Error('Target fee rate deve ser maior que fee rate atual')
      }

      const childVsize = params.childVsize || TYPICAL_CPFP_SIZE_VB

      // Fee atual do parent
      const parentFeeSat = Math.ceil(params.parentFeeRate * params.parentVsize)

      // Fee total necessária para o pacote
      const totalVsize = params.parentVsize + childVsize
      const totalFeeSat = Math.ceil(params.targetFeeRate * totalVsize)

      // Fee que o child precisa pagar
      const childFeeSat = totalFeeSat - parentFeeSat

      // Fee rate efetiva
      const effectiveFeeRate = totalFeeSat / totalVsize

      // Verificar viabilidade (child fee deve ser positiva)
      const isViable = childFeeSat > 0

      const result: SimpleCpfpResult = {
        totalFeeSat,
        childFeeSat,
        effectiveFeeRate,
        isViable,
      }

      setState(prev => ({
        ...prev,
        loading: false,
        feeCalculation: result,
        status: isViable ? 'ready' : 'error',
        error: isViable ? null : 'Fee da parent já atinge o target',
      }))

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao calcular CPFP'

      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
        status: 'error',
      }))

      return null
    }
  }, [])

  /**
   * Define TX CPFP quando construída externamente
   */
  const setCpfpTx = useCallback((txHex: string) => {
    setState(prev => ({
      ...prev,
      cpfpTxHex: txHex,
      status: 'ready',
    }))
  }, [])

  /**
   * Broadcast da TX CPFP
   */
  const broadcast = useCallback(
    async (broadcastFn: (txHex: string) => Promise<string>): Promise<string | null> => {
      if (!state.cpfpTxHex) {
        setState(prev => ({
          ...prev,
          error: 'Nenhuma TX CPFP para broadcast',
          status: 'error',
        }))
        return null
      }

      setState(prev => ({
        ...prev,
        loading: true,
        error: null,
        status: 'broadcasting',
      }))

      try {
        const txid = await broadcastFn(state.cpfpTxHex)

        setState(prev => ({
          ...prev,
          loading: false,
          status: 'success',
        }))

        return txid
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao broadcast TX CPFP'

        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
          status: 'error',
        }))

        return null
      }
    },
    [state.cpfpTxHex],
  )

  /**
   * Reseta estado
   */
  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  /**
   * Atualiza fee rate alvo
   */
  const setTargetFeeRate = useCallback((rate: number) => {
    setState(prev => ({
      ...prev,
      targetFeeRate: Math.max(MIN_FEE_RATE, Math.min(MAX_FEE_RATE, rate)),
    }))
  }, [])

  return {
    state,
    calculateFee,
    setCpfpTx,
    broadcast,
    reset,
    setTargetFeeRate,
  }
}

// ============================================================================
// Utilitários
// ============================================================================

/**
 * Formata fee para exibição
 */
export function formatFee(satoshis: number): string {
  if (satoshis >= 100000) {
    return `${(satoshis / 100000000).toFixed(8)} BTC`
  }
  return `${satoshis.toLocaleString()} sat`
}

/**
 * Estima tempo de confirmação baseado no fee rate
 */
export function estimateConfirmationTime(feeRate: number): string {
  if (feeRate >= 50) return '~10 min (próximo bloco)'
  if (feeRate >= 20) return '~30 min (1-3 blocos)'
  if (feeRate >= 10) return '~1 hora (3-6 blocos)'
  if (feeRate >= 5) return '~3 horas (6-18 blocos)'
  return '~24 horas ou mais'
}

/**
 * Valida se CPFP é viável
 */
export function isCpfpViable(params: { outputValueSat: bigint; estimatedFeeSat: number }): boolean {
  // Output deve cobrir fee + dust limit (546 sat)
  const minOutputAfterFee = 546n
  return params.outputValueSat > BigInt(params.estimatedFeeSat) + minOutputAfterFee
}
