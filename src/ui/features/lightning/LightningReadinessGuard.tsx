/**
 * LightningReadinessGuard
 *
 * Componente que controla a renderização baseada no estado de readiness do Lightning
 */

import React, { ReactNode } from 'react'
import { useLightningReadiness } from './hooks/useLightningReadiness'
import { ReadinessLevel } from '@/core/models/lightning/readiness'

interface LightningReadinessGuardProps {
  /** Nível mínimo de readiness necessário para renderizar children */
  requiredLevel: ReadinessLevel
  /** Componente a renderizar quando o nível é insuficiente */
  fallback?: ReactNode
  /** Children a renderizar quando o nível é suficiente */
  children: ReactNode
}

/**
 * Componente que controla a renderização baseada no estado de readiness do Lightning
 *
 * @example
 * ```tsx
 * <LightningReadinessGuard requiredLevel="CAN_SEND">
 *   <SendPaymentButton />
 * </LightningReadinessGuard>
 * ```
 */
export function LightningReadinessGuard({
  requiredLevel,
  fallback = null,
  children,
}: LightningReadinessGuardProps) {
  const { readinessLevel } = useLightningReadiness()

  if (readinessLevel < requiredLevel) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
