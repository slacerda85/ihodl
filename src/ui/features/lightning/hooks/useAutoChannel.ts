/**
 * Hook para verificar e gerenciar liquidez inbound automática
 */

import { useCallback, useEffect, useState } from 'react'
import { useLightningState } from './useLightningState'
import { useIsAutoChannelEnabled } from './useLightningPolicy'
import { useInboundBalance } from './useInboundBalance'
import { useLiquidityPolicy } from './useLiquidityPolicy'
import type { Millisatoshis, Satoshis } from '../types'
import LSPService, { type LiquidityAd, type FeeEstimate } from '@/core/services/ln-lsp-service'

/**
 * Hook para calcular capacidade inbound total disponível
 */
export function useInboundCapacity(): Satoshis {
  const { channels } = useLightningState()

  // Soma a capacidade inbound de todos os canais ativos
  const totalInboundCapacity = channels
    .filter((channel: any) => channel.isActive)
    .reduce((total: Satoshis, channel: any) => total + channel.remoteBalanceSat, 0n)

  return totalInboundCapacity
}

/**
 * Hook para verificar se há liquidez suficiente para um pagamento
 */
export function useHasSufficientLiquidity(amountMsat: Millisatoshis): boolean {
  const inboundCapacity = useInboundCapacity()
  const inboundBalance = useInboundBalance()

  // Converte para satoshis para comparação
  const amountSat = amountMsat / 1000n

  // Capacidade efetiva = capacidade dos canais + saldo on-chain pendente
  const effectiveCapacity = inboundCapacity + inboundBalance.pendingOnChainBalance

  return effectiveCapacity >= amountSat
}

/**
 * Hook para calcular quanto de capacidade adicional é necessária
 */
export function useRequiredAdditionalCapacity(amountMsat: Millisatoshis): Satoshis {
  const inboundCapacity = useInboundCapacity()
  const inboundBalance = useInboundBalance()

  const amountSat = amountMsat / 1000n
  const effectiveCapacity = inboundCapacity + inboundBalance.pendingOnChainBalance

  if (effectiveCapacity >= amountSat) {
    return 0n
  }

  return amountSat - effectiveCapacity
}

/**
 * Hook para monitorar saldo on-chain e acionar abertura automática de canal
 */
export function useOnChainBalanceMonitor() {
  const inboundBalance = useInboundBalance()
  const liquidityPolicy = useLiquidityPolicy()
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [lastCheckedBalance, setLastCheckedBalance] = useState<Satoshis>(0n)

  // Monitora mudanças no saldo on-chain
  useEffect(() => {
    const currentBalance = inboundBalance.pendingOnChainBalance
    const threshold = liquidityPolicy.onChainBalanceThreshold || 100000n

    // Se o saldo aumentou e está acima do threshold, marca para monitoramento
    if (currentBalance > lastCheckedBalance && currentBalance >= threshold) {
      setIsMonitoring(true)
    }

    setLastCheckedBalance(currentBalance)
  }, [
    inboundBalance.pendingOnChainBalance,
    liquidityPolicy.onChainBalanceThreshold,
    lastCheckedBalance,
  ])

  const resetMonitoring = useCallback(() => {
    setIsMonitoring(false)
  }, [])

  return {
    shouldMonitor: isMonitoring,
    pendingBalance: inboundBalance.pendingOnChainBalance,
    threshold: liquidityPolicy.onChainBalanceThreshold || 100000n,
    resetMonitoring,
  }
}

/**
 * Hook para integração com LSP para abertura automática
 */
export function useLSPIntegration() {
  const [lspService] = useState(() => {
    // TODO: Obter instância do LightningService do contexto
    // Por enquanto, cria uma instância mock
    const mockLightningService = {} as any
    return new LSPService(mockLightningService)
  })

  const getAvailableLSPs = useCallback((): LiquidityAd[] => {
    return lspService.getAvailableLSPs()
  }, [lspService])

  const estimateChannelFee = useCallback(
    (lspId: string, capacity: Satoshis): FeeEstimate | null => {
      return lspService.estimateFee(lspId, capacity)
    },
    [lspService],
  )

  const openChannelViaLSP = useCallback(
    async (lspId: string, capacity: Satoshis, maxFee?: Satoshis) => {
      return await lspService.openChannelViaLSP(lspId, capacity, maxFee)
    },
    [lspService],
  )

  const selectBestLSP = useCallback(
    (capacity: Satoshis, maxFee?: Satoshis): LiquidityAd | null => {
      return lspService.selectBestLSP(capacity, maxFee)
    },
    [lspService],
  )

  return {
    getAvailableLSPs,
    estimateChannelFee,
    openChannelViaLSP,
    selectBestLSP,
  }
}

/**
 * Hook para abertura automática de canal
 */
export function useAutoChannelOpening() {
  const isAutoEnabled = useIsAutoChannelEnabled()
  const inboundCapacity = useInboundCapacity()
  const inboundBalance = useInboundBalance()
  const liquidityPolicy = useLiquidityPolicy()
  const { openChannelViaLSP, selectBestLSP } = useLSPIntegration()

  /**
   * Abre um canal automaticamente se necessário baseado no saldo on-chain
   * Retorna true se um canal foi aberto, false se não foi necessário ou não pôde ser aberto
   */
  const openChannelIfNeeded = useCallback(
    async (amountMsat?: Millisatoshis): Promise<boolean> => {
      if (!isAutoEnabled) {
        return false
      }

      // Se amountMsat for fornecido, verifica se é necessário
      if (amountMsat) {
        const amountSat = amountMsat / 1000n
        const effectiveCapacity = inboundCapacity + inboundBalance.pendingOnChainBalance

        if (effectiveCapacity >= amountSat) {
          return false // Já tem capacidade suficiente
        }
      }

      // Verifica se há saldo on-chain pendente suficiente
      const pendingBalance = inboundBalance.pendingOnChainBalance
      const threshold = liquidityPolicy.inboundLiquidityTarget || 100000n

      if (pendingBalance < threshold) {
        return false // Saldo insuficiente para abertura automática
      }

      try {
        // Usa o saldo pendente como base para a capacidade do canal
        const channelCapacity = pendingBalance

        // Seleciona o melhor LSP baseado na capacidade e limites de taxa
        const maxFee = BigInt(liquidityPolicy.maxAbsoluteFee)
        const bestLSP = selectBestLSP(channelCapacity, maxFee)

        if (!bestLSP) {
          console.log('[AutoChannel] No suitable LSP found for capacity:', channelCapacity)
          return false
        }

        console.log(
          `[AutoChannel] Opening channel via ${bestLSP.name} with capacity: ${channelCapacity}`,
        )

        // Abre canal via LSP
        const result = await openChannelViaLSP(bestLSP.lspId, channelCapacity, maxFee)

        if (result.success) {
          console.log(`[AutoChannel] Channel opened successfully: ${result.channelId}`)
          return true
        } else {
          console.error('[AutoChannel] Failed to open channel:', result.error)
          return false
        }
      } catch (error) {
        console.error('[AutoChannel] Failed to open channel:', error)
        return false
      }
    },
    [
      isAutoEnabled,
      inboundCapacity,
      inboundBalance,
      liquidityPolicy,
      openChannelViaLSP,
      selectBestLSP,
    ],
  )

  /**
   * Abre canal manualmente usando fundos on-chain
   */
  const openChannelManually = useCallback(
    async (capacity: Satoshis, lspId?: string): Promise<boolean> => {
      try {
        const maxFee = BigInt(liquidityPolicy.maxAbsoluteFee)

        let selectedLSP: LiquidityAd | null = null

        if (lspId) {
          selectedLSP = selectBestLSP(capacity, maxFee)
        } else {
          // Seleciona automaticamente o melhor LSP
          selectedLSP = selectBestLSP(capacity, maxFee)
        }

        if (!selectedLSP) {
          console.error('[AutoChannel] No suitable LSP found')
          return false
        }

        const result = await openChannelViaLSP(selectedLSP.lspId, capacity, maxFee)

        return result.success
      } catch (error) {
        console.error('[AutoChannel] Failed to open channel manually:', error)
        return false
      }
    },
    [liquidityPolicy, selectBestLSP, openChannelViaLSP],
  )

  return {
    openChannelIfNeeded,
    openChannelManually,
    isAutoEnabled,
    pendingBalance: inboundBalance.pendingOnChainBalance,
  }
}
