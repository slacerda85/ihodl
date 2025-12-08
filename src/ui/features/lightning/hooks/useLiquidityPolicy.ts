/**
 * Hook para acessar política de liquidez atual
 */

import { useLightningSettings } from '@/ui/features/app-provider'
import type { LiquidityConfig } from '@/ui/features/settings'

/**
 * Valores padrão para política de liquidez
 */
const DEFAULT_LIQUIDITY_POLICY: LiquidityConfig = {
  type: 'disable',
  maxAbsoluteFee: 5000,
  maxRelativeFeeBasisPoints: 5000, // 50%
  skipAbsoluteFeeCheck: false,
  maxAllowedFeeCredit: 100000,
  inboundLiquidityTarget: undefined,
}

/**
 * Hook para acessar a política de liquidez configurada
 */
export function useLiquidityPolicy(): LiquidityConfig {
  const lightning = useLightningSettings()

  // Verificação de segurança para configurações inexistentes
  if (!lightning?.liquidity) {
    return DEFAULT_LIQUIDITY_POLICY
  }

  const config = lightning.liquidity

  // Conversão segura para number com valores padrão
  const safeNumber = (value: any, defaultValue: number): number => {
    if (value === null || value === undefined) return defaultValue
    const num = Number(value)
    return isNaN(num) ? defaultValue : num
  }

  return {
    type: config.type ?? DEFAULT_LIQUIDITY_POLICY.type,
    maxAbsoluteFee: safeNumber(config.maxAbsoluteFee, DEFAULT_LIQUIDITY_POLICY.maxAbsoluteFee),
    maxRelativeFeeBasisPoints: safeNumber(
      config.maxRelativeFeeBasisPoints,
      DEFAULT_LIQUIDITY_POLICY.maxRelativeFeeBasisPoints,
    ),
    skipAbsoluteFeeCheck:
      config.skipAbsoluteFeeCheck ?? DEFAULT_LIQUIDITY_POLICY.skipAbsoluteFeeCheck,
    maxAllowedFeeCredit: safeNumber(
      config.maxAllowedFeeCredit,
      DEFAULT_LIQUIDITY_POLICY.maxAllowedFeeCredit,
    ),
    inboundLiquidityTarget: config.inboundLiquidityTarget
      ? safeNumber(config.inboundLiquidityTarget, 0)
      : DEFAULT_LIQUIDITY_POLICY.inboundLiquidityTarget,
  }
}

/**
 * Valores padrão para configuração de swap-in
 */
const DEFAULT_SWAP_IN_CONFIG = {
  enabled: false,
  maxAbsoluteFee: 5000,
  maxRelativeFeeBasisPoints: 5000, // 50%
  skipAbsoluteFeeCheck: false,
}

/**
 * Hook para acessar configuração de swap-in
 */
export function useSwapInPolicy() {
  const lightning = useLightningSettings()

  // Verificação de segurança
  if (!lightning?.swapIn) {
    return DEFAULT_SWAP_IN_CONFIG
  }

  return {
    enabled: lightning.swapIn.enabled ?? DEFAULT_SWAP_IN_CONFIG.enabled,
    maxAbsoluteFee: lightning.swapIn.maxAbsoluteFee ?? DEFAULT_SWAP_IN_CONFIG.maxAbsoluteFee,
    maxRelativeFeeBasisPoints:
      lightning.swapIn.maxRelativeFeeBasisPoints ??
      DEFAULT_SWAP_IN_CONFIG.maxRelativeFeeBasisPoints,
    skipAbsoluteFeeCheck:
      lightning.swapIn.skipAbsoluteFeeCheck ?? DEFAULT_SWAP_IN_CONFIG.skipAbsoluteFeeCheck,
  }
}

/**
 * Hook para verificar se abertura automática está habilitada
 */
export function useIsAutoChannelEnabled(): boolean {
  const policy = useLiquidityPolicy()
  return policy.type === 'auto'
}
