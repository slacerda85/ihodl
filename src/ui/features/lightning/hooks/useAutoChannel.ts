/**
 * Hook para verificar e gerenciar liquidez inbound automática
 */

import { useCallback } from 'react'
import { useLightningState } from './useLightningState'
import { useLightningActions } from './useLightningActions'
import { useIsAutoChannelEnabled } from './useLightningPolicy'
import { useInboundBalance } from './useInboundBalance'
import type { Millisatoshis, Satoshis } from '../types'

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
 * Hook para abertura automática de canal
 */
export function useAutoChannelOpening() {
  const isAutoEnabled = useIsAutoChannelEnabled()
  const { createChannel } = useLightningActions()
  const inboundCapacity = useInboundCapacity()
  const inboundBalance = useInboundBalance()

  /**
   * Abre um canal automaticamente se necessário
   * Retorna true se um canal foi aberto, false se não foi necessário ou não pôde ser aberto
   */
  const openChannelIfNeeded = useCallback(
    async (amountMsat: Millisatoshis): Promise<boolean> => {
      if (!isAutoEnabled) {
        return false
      }

      const amountSat = amountMsat / 1000n
      const effectiveCapacity = inboundCapacity + inboundBalance.pendingOnChainBalance

      if (effectiveCapacity >= amountSat) {
        return false // Já tem capacidade suficiente
      }

      const requiredCapacity = amountSat - effectiveCapacity

      try {
        // Por enquanto, usa valores padrão para abertura automática
        // TODO: Implementar lógica mais sofisticada para escolher peer e parâmetros
        const channelCapacity = Math.max(Number(requiredCapacity), 100000) // Mínimo 100k sats

        // TODO: Obter peerId de um peer confiável ou LSP
        // Por enquanto, retorna false indicando que não conseguiu abrir
        console.log(`[AutoChannel] Would open channel with capacity: ${channelCapacity} sats`)

        // Simulação - em produção, descomente:
        // await createChannel({
        //   peerId: 'trusted-peer-id', // TODO: obter peer confiável
        //   capacitySat: BigInt(channelCapacity),
        //   pushMsat: 0n, // Não push para canais de recebimento
        // })

        return false // Temporariamente retorna false até implementar peer selection
      } catch (error) {
        console.error('[AutoChannel] Failed to open channel:', error)
        return false
      }
    },
    [isAutoEnabled, inboundCapacity, inboundBalance],
  )

  return {
    openChannelIfNeeded,
    isAutoEnabled,
  }
}
