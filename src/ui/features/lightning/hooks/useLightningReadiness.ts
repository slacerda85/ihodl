/**
 * Hook para acessar o estado de readiness do Lightning
 *
 * Fornece acesso ao estado de prontidão do sistema Lightning.
 * O estado de readiness é gerenciado pelo WorkerService e propagado
 * para o store de forma unidirecional.
 *
 * @see docs/lightning-worker-consolidation-plan.md - Fase 4
 */

import { useLightningReadinessState, useLightningReadinessLevel } from '@/ui/features/app-provider'
import {
  type ReadinessState,
  type ReadinessLevel,
  getReadinessBlockers,
  isOperationAllowed,
} from '@/core/models/lightning/readiness'

export type { ReadinessState, ReadinessLevel }

/**
 * Hook para acessar o estado de readiness do Lightning
 *
 * O estado é consumido diretamente do store, que por sua vez
 * recebe eventos do WorkerService (fluxo unidirecional).
 *
 * @returns Estado de readiness e nível atual
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { readinessState, readinessLevel } = useLightningReadiness()
 *
 *   if (readinessLevel === ReadinessLevel.NOT_READY) {
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
  const readinessState = useLightningReadinessState()
  const readinessLevel = useLightningReadinessLevel()

  return {
    readinessState,
    readinessLevel,
  }
}

/**
 * Hook para verificar se uma operação específica é permitida
 *
 * @param operation - Operação a verificar ('receive', 'send', 'channel_management')
 * @returns true se a operação é permitida no nível de readiness atual
 */
export function useCanPerformOperation(
  operation: 'receive' | 'send' | 'channel_management',
): boolean {
  const readinessLevel = useLightningReadinessLevel()
  return isOperationAllowed(readinessLevel, operation)
}

/**
 * Hook para obter os bloqueadores de readiness atuais
 *
 * @returns Array de strings descrevendo o que está impedindo full readiness
 */
export function useReadinessBlockers(): string[] {
  const readinessState = useLightningReadinessState()
  return getReadinessBlockers(readinessState)
}
