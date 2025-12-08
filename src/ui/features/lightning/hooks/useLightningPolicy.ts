/**
 * Hook para acessar política de liquidez atual
 */

import { useLightningSettings } from '@/ui/features/app-provider'
import type { LiquidityPolicy } from '@/ui/features/settings'

/**
 * Hook para acessar a política de liquidez configurada
 */
export function useLightningPolicy(): LiquidityPolicy {
  const lightning = useLightningSettings()

  const config = lightning.liquidity

  return {
    type: config.type,
    maxAbsoluteFee: BigInt(config.maxAbsoluteFee),
    maxRelativeFeeBasisPoints: config.maxRelativeFeeBasisPoints,
    skipAbsoluteFeeCheck: config.skipAbsoluteFeeCheck,
    maxAllowedFeeCredit: BigInt(config.maxAllowedFeeCredit),
    inboundLiquidityTarget: config.inboundLiquidityTarget
      ? BigInt(config.inboundLiquidityTarget)
      : undefined,
  }
}

/**
 * Hook para acessar configuração de swap-in
 */
export function useSwapInPolicy() {
  const lightning = useLightningSettings()
  return lightning.swapIn
}

/**
 * Hook para verificar se abertura automática está habilitada
 */
export function useIsAutoChannelEnabled(): boolean {
  const policy = useLightningPolicy()
  return policy.type === 'auto'
}
