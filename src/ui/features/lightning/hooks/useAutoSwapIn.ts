/**
 * Hook para gerenciamento automático de swap-in (on-chain para Lightning)
 */

import { useCallback } from 'react'
import { useSubmarineSwap } from './useSubmarineSwap'
import { useSwapInPolicy } from './useLightningPolicy'
import { useInboundBalance } from './useInboundBalance'
import { useLightningActions } from './useLightningActions'
import type { Satoshis } from '../types'

/**
 * Hook para operações automáticas de swap-in
 */
export function useAutoSwapIn() {
  const swapInPolicy = useSwapInPolicy()
  const inboundBalance = useInboundBalance()
  const { generateInvoice } = useLightningActions()
  const submarineSwap = useSubmarineSwap()

  /**
   * Verifica se pode fazer loop-in para um determinado valor
   */
  const canLoopIn = useCallback((amountSat: Satoshis): boolean => {
    // TODO: Implementar verificação real com useCanLoopIn
    // Por enquanto, assume que sempre pode fazer loop-in
    return amountSat > 0n
  }, [])

  /**
   * Verifica se deve executar swap-in automático baseado na política
   */
  const shouldAutoSwapIn = useCallback((): boolean => {
    if (!swapInPolicy.enabled) {
      return false
    }

    // Verifica se há saldo on-chain pendente
    if (inboundBalance.pendingOnChainBalance <= 0n) {
      return false
    }

    // Verifica se será convertido automaticamente
    return inboundBalance.willAutoConvert
  }, [swapInPolicy.enabled, inboundBalance])

  /**
   * Executa swap-in automático para o saldo on-chain pendente
   */
  const executeAutoSwapIn = useCallback(async (): Promise<boolean> => {
    if (!shouldAutoSwapIn()) {
      return false
    }

    try {
      const amountSat = inboundBalance.pendingOnChainBalance

      // Verifica se pode fazer loop-in
      if (!canLoopIn(amountSat)) {
        console.log('[AutoSwapIn] Cannot perform loop-in for amount:', amountSat)
        return false
      }

      // Gera invoice para receber os fundos
      const amountMsat = amountSat * 1000n
      const invoice = await generateInvoice(amountMsat, 'Auto swap-in from on-chain balance')

      // TODO: Obter endereço de refund do usuário
      const refundAddress = 'bc1q...' // Placeholder - implementar obtenção do endereço

      // Executa o loop-in
      const result = await submarineSwap.createLoopIn({
        amountSat,
        invoice: invoice.invoice,
        refundAddress,
      })

      console.log('[AutoSwapIn] Loop-in initiated:', result)
      return true
    } catch (error) {
      console.error('[AutoSwapIn] Failed to execute auto swap-in:', error)
      return false
    }
  }, [
    shouldAutoSwapIn,
    inboundBalance.pendingOnChainBalance,
    generateInvoice,
    submarineSwap,
    canLoopIn,
  ])

  /**
   * Verifica se as taxas do swap-in estão dentro dos limites da política
   */
  const isSwapInFeeAcceptable = useCallback(
    (feeSat: Satoshis, amountSat: Satoshis): boolean => {
      if (swapInPolicy.skipAbsoluteFeeCheck) {
        // Só verifica taxa relativa
        const relativeFeeBps = Number((feeSat * 10000n) / amountSat)
        return relativeFeeBps <= swapInPolicy.maxRelativeFeeBasisPoints
      }

      // Verifica taxa absoluta
      if (feeSat > swapInPolicy.maxAbsoluteFee) {
        return false
      }

      // Verifica taxa relativa
      const relativeFeeBps = Number((feeSat * 10000n) / amountSat)
      return relativeFeeBps <= swapInPolicy.maxRelativeFeeBasisPoints
    },
    [swapInPolicy],
  )

  /**
   * Calcula a taxa estimada para swap-in
   */
  const estimateSwapInFee = useCallback((amountSat: Satoshis): Satoshis => {
    // TODO: Implementar cálculo real baseado no serviço de swap
    // Por enquanto, usa uma estimativa simples
    const feeRate = 0.001 // 0.1%
    return BigInt(Math.floor(Number(amountSat) * feeRate))
  }, [])

  return {
    shouldAutoSwapIn,
    executeAutoSwapIn,
    isSwapInFeeAcceptable,
    estimateSwapInFee,
    swapInPolicy,
    pendingBalance: inboundBalance.pendingOnChainBalance,
  }
}

/**
 * Hook para verificar se há saldo pendente elegível para swap-in automático
 */
export function useHasPendingSwapInBalance(): boolean {
  const { pendingBalance } = useAutoSwapIn()
  return pendingBalance > 0n
}

/**
 * Hook para obter o valor estimado de taxa para swap-in
 */
export function useEstimatedSwapInFee(amountSat: Satoshis): Satoshis {
  const { estimateSwapInFee } = useAutoSwapIn()
  return estimateSwapInFee(amountSat)
}
