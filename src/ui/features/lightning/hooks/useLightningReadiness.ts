/**
 * Hook para acessar o estado de readiness do Lightning
 *
 * Fornece acesso ao estado de prontidão do sistema Lightning
 */

import { useLightningContext } from './useLightningContext'
import type { ReadinessState, ReadinessLevel } from '@/core/models/lightning/readiness'

/**
 * Hook para acessar o estado de readiness do Lightning
 *
 * @returns Estado de readiness e nível atual
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { readinessState, readinessLevel } = useLightningReadiness()
 *
 *   if (readinessLevel === 'NOT_READY') {
 *     return <Text>Lightning não está pronto</Text>
 *   }
 *
 *   return <Text>Lightning está pronto para {readinessLevel}</Text>
 * }
 * ```
 */
export function useLightningReadiness(): {
  readinessState: ReadinessState
  readinessLevel: ReadinessLevel
} {
  const { readinessState, readinessLevel } = useLightningContext()

  return {
    readinessState,
    readinessLevel,
  }
}
