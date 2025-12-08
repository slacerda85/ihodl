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
    maxAbsoluteFee: BigInt(config.maxAbsoluteFee ?? 5000),
    maxRelativeFeeBasisPoints: config.maxRelativeFeeBasisPoints ?? 5000,
    skipAbsoluteFeeCheck: config.skipAbsoluteFeeCheck ?? false,
    maxAllowedFeeCredit: BigInt(config.maxAllowedFeeCredit ?? 0),
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
