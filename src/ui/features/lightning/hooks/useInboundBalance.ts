/**
 * Hook para acessar estado de liquidez inbound
 */

import { useLightningState } from './useLightningState'

/**
 * Hook para acessar o estado de liquidez inbound (saldo on-chain pendente)
 */
export function useInboundBalance() {
  const { inboundLiquidity } = useLightningState()
  return inboundLiquidity
}

/**
 * Hook para verificar se há saldo on-chain pendente de conversão
 */
export function useHasPendingOnChainBalance(): boolean {
  const { pendingOnChainBalance } = useInboundBalance()
  return pendingOnChainBalance > 0n
}

/**
 * Hook para verificar se o saldo pendente será convertido automaticamente
 */
export function useWillAutoConvert(): boolean {
  const { willAutoConvert } = useInboundBalance()
  return willAutoConvert
}
