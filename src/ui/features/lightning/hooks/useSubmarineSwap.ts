/**
 * useSubmarineSwap - Hook para gerenciamento de Submarine Swaps
 *
 * Fornece funções para criar, monitorar e executar submarine swaps:
 * - Loop In: On-chain BTC → Lightning (Forward Swap)
 * - Loop Out: Lightning → On-chain BTC (Reverse Swap)
 *
 * Baseado na implementação em submarineSwap.ts
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  SwapType,
  SwapState,
  SwapData,
  SwapFees,
  SwapOffer,
  SwapManager,
  calculateSwapFee,
  MIN_SWAP_AMOUNT_SAT,
} from '@/core/services/ln-submarine-swap-service'
import { useLightningState } from '@/ui/features/app-provider'

// ==========================================
// TYPES
// ==========================================

/**
 * Parâmetros para criar Loop In (Chain → Lightning)
 */
export interface LoopInParams {
  /** Valor em satoshis a receber no Lightning */
  amountSat: bigint
  /** Invoice Lightning para receber os fundos */
  invoice: string
  /** Endereço Bitcoin para refund em caso de expiração */
  refundAddress: string
}

/**
 * Parâmetros para criar Loop Out (Lightning → Chain)
 */
export interface LoopOutParams {
  /** Valor em satoshis a receber on-chain */
  amountSat: bigint
  /** Endereço Bitcoin para receber os fundos */
  onchainAddress: string
}

/**
 * Resultado de operação de swap
 */
export interface SwapOperationResult {
  success: boolean
  error?: string
  swap?: SwapData
}

/**
 * Limites do provider de swap
 */
export interface SwapLimits {
  minAmount: bigint
  maxLoopIn: bigint
  maxLoopOut: bigint
}

/**
 * Estado do hook de swap
 */
export interface SubmarineSwapState {
  /** Swaps ativos */
  activeSwaps: SwapData[]
  /** Histórico de swaps (completados/falhos) */
  swapHistory: SwapData[]
  /** Oferta atual do servidor */
  currentOffer: SwapOffer | null
  /** Fees atuais */
  currentFees: SwapFees | null
  /** Limites */
  limits: SwapLimits | null
  /** Se está conectado ao provider */
  isProviderConnected: boolean
  /** Último erro */
  lastError: string | null
}

// ==========================================
// DEFAULT VALUES
// ==========================================

const DEFAULT_FEES: SwapFees = {
  percentageBps: 100, // 1%
  miningFeeSat: 2000n,
  minAmountSat: BigInt(MIN_SWAP_AMOUNT_SAT),
  maxForwardSat: 10000000n, // 0.1 BTC
  maxReverseSat: 10000000n,
}

const DEFAULT_OFFER: SwapOffer = {
  fees: DEFAULT_FEES,
  serverPubkey: '',
  relays: [],
  powBits: 0,
  timestamp: Date.now(),
}

// ==========================================
// HOOK
// ==========================================

export function useSubmarineSwap(network: 'mainnet' | 'testnet' = 'mainnet') {
  const lightningState = useLightningState()
  const swapManagerRef = useRef<SwapManager | null>(null)

  const [state, setState] = useState<SubmarineSwapState>({
    activeSwaps: [],
    swapHistory: [],
    currentOffer: DEFAULT_OFFER,
    currentFees: DEFAULT_FEES,
    limits: {
      minAmount: BigInt(MIN_SWAP_AMOUNT_SAT),
      maxLoopIn: DEFAULT_FEES.maxForwardSat,
      maxLoopOut: DEFAULT_FEES.maxReverseSat,
    },
    isProviderConnected: false,
    lastError: null,
  })

  const [isLoading, setIsLoading] = useState(false)

  // Inicializar SwapManager
  useEffect(() => {
    if (!swapManagerRef.current) {
      swapManagerRef.current = new SwapManager(network)
    }
  }, [network])

  /**
   * Atualiza fees do provider
   */
  const refreshFees = useCallback(async (): Promise<SwapFees | null> => {
    setIsLoading(true)
    setState(prev => ({ ...prev, lastError: null }))

    try {
      // TODO: Implementar chamada real ao provider (Boltz API)
      // Por enquanto, usar valores default
      const fees = DEFAULT_FEES

      setState(prev => ({
        ...prev,
        currentFees: fees,
        limits: {
          minAmount: fees.minAmountSat,
          maxLoopIn: fees.maxForwardSat,
          maxLoopOut: fees.maxReverseSat,
        },
        isProviderConnected: true,
      }))

      return fees
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar fees'
      setState(prev => ({ ...prev, lastError: message }))
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Calcula fee estimada para um swap
   */
  const estimateFee = useCallback(
    (amountSat: bigint, type: SwapType): bigint => {
      const fees = state.currentFees || DEFAULT_FEES
      return calculateSwapFee(amountSat, fees)
    },
    [state.currentFees],
  )

  /**
   * Valida parâmetros de swap
   */
  const validateSwapParams = useCallback(
    (amountSat: bigint, type: SwapType): { valid: boolean; errors: string[] } => {
      const errors: string[] = []
      const limits = state.limits

      if (!limits) {
        errors.push('Limites não disponíveis')
        return { valid: false, errors }
      }

      if (amountSat < limits.minAmount) {
        errors.push(`Valor mínimo: ${limits.minAmount} sats`)
      }

      if (type === SwapType.FORWARD && amountSat > limits.maxLoopIn) {
        errors.push(`Valor máximo para Loop In: ${limits.maxLoopIn} sats`)
      }

      if (type === SwapType.REVERSE && amountSat > limits.maxLoopOut) {
        errors.push(`Valor máximo para Loop Out: ${limits.maxLoopOut} sats`)
      }

      // Verificar saldo Lightning para Loop Out
      if (type === SwapType.REVERSE) {
        const balance = lightningState.balance?.totalSendable || 0n
        if (amountSat > balance) {
          errors.push(`Saldo Lightning insuficiente: ${balance} sats`)
        }
      }

      return { valid: errors.length === 0, errors }
    },
    [state.limits, lightningState.balance],
  )

  /**
   * Cria um Loop In (On-chain → Lightning)
   */
  const createLoopIn = useCallback(
    async (params: LoopInParams): Promise<SwapOperationResult> => {
      setIsLoading(true)
      setState(prev => ({ ...prev, lastError: null }))

      try {
        const manager = swapManagerRef.current
        if (!manager) {
          throw new Error('SwapManager não inicializado')
        }

        // Validar parâmetros
        const validation = validateSwapParams(params.amountSat, SwapType.FORWARD)
        if (!validation.valid) {
          throw new Error(validation.errors.join(', '))
        }

        const offer = state.currentOffer || DEFAULT_OFFER

        // Criar swap
        const swap = await manager.createForwardSwap({
          amountSat: params.amountSat,
          invoice: params.invoice,
          refundAddress: params.refundAddress,
          offer,
        })

        // Adicionar aos swaps ativos
        setState(prev => ({
          ...prev,
          activeSwaps: [...prev.activeSwaps, swap],
        }))

        return { success: true, swap }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao criar Loop In'
        setState(prev => ({ ...prev, lastError: message }))
        return { success: false, error: message }
      } finally {
        setIsLoading(false)
      }
    },
    [state.currentOffer, validateSwapParams],
  )

  /**
   * Cria um Loop Out (Lightning → On-chain)
   */
  const createLoopOut = useCallback(
    async (params: LoopOutParams): Promise<SwapOperationResult> => {
      setIsLoading(true)
      setState(prev => ({ ...prev, lastError: null }))

      try {
        const manager = swapManagerRef.current
        if (!manager) {
          throw new Error('SwapManager não inicializado')
        }

        // Validar parâmetros
        const validation = validateSwapParams(params.amountSat, SwapType.REVERSE)
        if (!validation.valid) {
          throw new Error(validation.errors.join(', '))
        }

        const offer = state.currentOffer || DEFAULT_OFFER

        // Criar swap
        const swap = await manager.createReverseSwap({
          amountSat: params.amountSat,
          onchainAddress: params.onchainAddress,
          offer,
        })

        // Adicionar aos swaps ativos
        setState(prev => ({
          ...prev,
          activeSwaps: [...prev.activeSwaps, swap],
        }))

        return { success: true, swap }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao criar Loop Out'
        setState(prev => ({ ...prev, lastError: message }))
        return { success: false, error: message }
      } finally {
        setIsLoading(false)
      }
    },
    [state.currentOffer, validateSwapParams],
  )

  /**
   * Atualiza estado de um swap
   */
  const updateSwapState = useCallback((swapId: string, newState: SwapState) => {
    setState(prev => {
      const swapIndex = prev.activeSwaps.findIndex(s => s.paymentHash === swapId)

      if (swapIndex === -1) return prev

      const updatedSwaps = [...prev.activeSwaps]
      const swap = { ...updatedSwaps[swapIndex], state: newState, updatedAt: Date.now() }
      updatedSwaps[swapIndex] = swap

      // Mover para histórico se completado ou falhou
      const isFinished = [SwapState.COMPLETED, SwapState.REFUNDED, SwapState.FAILED].includes(
        newState,
      )

      if (isFinished) {
        return {
          ...prev,
          activeSwaps: updatedSwaps.filter((_, i) => i !== swapIndex),
          swapHistory: [swap, ...prev.swapHistory],
        }
      }

      return { ...prev, activeSwaps: updatedSwaps }
    })
  }, [])

  /**
   * Cancela um swap ativo (se possível)
   */
  const cancelSwap = useCallback(
    async (swapId: string): Promise<SwapOperationResult> => {
      const swap = state.activeSwaps.find(s => s.paymentHash === swapId)

      if (!swap) {
        return { success: false, error: 'Swap não encontrado' }
      }

      // Só pode cancelar swaps não confirmados
      if (swap.state !== SwapState.CREATED) {
        return { success: false, error: 'Swap já está em andamento' }
      }

      updateSwapState(swapId, SwapState.FAILED)
      return { success: true, swap: { ...swap, state: SwapState.FAILED } }
    },
    [state.activeSwaps, updateSwapState],
  )

  /**
   * Busca status de um swap no provider
   */
  const refreshSwapStatus = useCallback(
    async (swapId: string): Promise<SwapOperationResult> => {
      setIsLoading(true)

      try {
        // TODO: Implementar chamada real ao provider
        const swap = state.activeSwaps.find(s => s.paymentHash === swapId)

        if (!swap) {
          return { success: false, error: 'Swap não encontrado' }
        }

        // Por enquanto, retornar estado atual
        return { success: true, swap }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao buscar status'
        return { success: false, error: message }
      } finally {
        setIsLoading(false)
      }
    },
    [state.activeSwaps],
  )

  /**
   * Retorna swap pelo ID
   */
  const getSwap = useCallback(
    (swapId: string): SwapData | null => {
      return (
        state.activeSwaps.find(s => s.paymentHash === swapId) ||
        state.swapHistory.find(s => s.paymentHash === swapId) ||
        null
      )
    },
    [state.activeSwaps, state.swapHistory],
  )

  /**
   * Limpa histórico de swaps
   */
  const clearHistory = useCallback(() => {
    setState(prev => ({ ...prev, swapHistory: [] }))
  }, [])

  /**
   * Obtém resumo dos swaps
   */
  const getSwapSummary = useCallback(() => {
    const active = state.activeSwaps.length
    const completed = state.swapHistory.filter(s => s.state === SwapState.COMPLETED).length
    const failed = state.swapHistory.filter(
      s => s.state === SwapState.FAILED || s.state === SwapState.REFUNDED,
    ).length

    const totalLoopIn = state.swapHistory
      .filter(s => s.type === SwapType.FORWARD && s.state === SwapState.COMPLETED)
      .reduce((acc, s) => acc + s.lightningAmountSat, 0n)

    const totalLoopOut = state.swapHistory
      .filter(s => s.type === SwapType.REVERSE && s.state === SwapState.COMPLETED)
      .reduce((acc, s) => acc + s.onchainAmountSat, 0n)

    return {
      active,
      completed,
      failed,
      totalLoopIn,
      totalLoopOut,
    }
  }, [state.activeSwaps, state.swapHistory])

  return {
    // Estado
    state,
    isLoading,

    // Ações de swap
    createLoopIn,
    createLoopOut,
    cancelSwap,
    refreshSwapStatus,
    updateSwapState,

    // Consultas
    getSwap,
    getSwapSummary,
    estimateFee,
    validateSwapParams,

    // Provider
    refreshFees,
    clearHistory,
  }
}

// ==========================================
// UTILITY HOOKS
// ==========================================

/**
 * Hook para obter apenas swaps ativos
 */
export function useActiveSwaps() {
  const { state } = useSubmarineSwap()
  return state.activeSwaps
}

/**
 * Hook para obter limites de swap
 */
export function useSwapLimits() {
  const { state } = useSubmarineSwap()
  return state.limits
}

/**
 * Hook para verificar se pode fazer Loop In
 */
export function useCanLoopIn(amountSat: bigint) {
  const { validateSwapParams } = useSubmarineSwap()
  return validateSwapParams(amountSat, SwapType.FORWARD)
}

/**
 * Hook para verificar se pode fazer Loop Out
 */
export function useCanLoopOut(amountSat: bigint) {
  const { validateSwapParams } = useSubmarineSwap()
  return validateSwapParams(amountSat, SwapType.REVERSE)
}
