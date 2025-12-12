/**
 * Hook para monitorar o estado de routing do Lightning Network
 *
 * Permite à UI acompanhar quando o sistema muda entre trampoline e local pathfinding
 * no modo híbrido.
 */

import { useSyncExternalStore } from 'react'
import {
  getLightningRoutingService,
  RoutingMode,
  RoutingServiceState,
} from '@/core/services/ln-routing-service'

// ==========================================
// STORE INTERNO
// ==========================================

let routingState: RoutingServiceState | null = null
const routingSubscribers = new Set<() => void>()

function subscribeToRoutingState(callback: () => void): () => void {
  routingSubscribers.add(callback)

  // Inicializar estado se ainda não foi feito
  if (!routingState) {
    const service = getLightningRoutingService()
    routingState = service.getRoutingStats()

    // Configurar listeners para mudanças de estado
    service.on('modeChanged', () => {
      routingState = service.getRoutingStats()
      routingSubscribers.forEach(cb => cb())
    })

    service.on('localRoutingAvailable', () => {
      routingState = service.getRoutingStats()
      routingSubscribers.forEach(cb => cb())
    })
  }

  return () => {
    routingSubscribers.delete(callback)
  }
}

function getRoutingState(): RoutingServiceState {
  if (!routingState) {
    const service = getLightningRoutingService()
    routingState = service.getRoutingStats()
  }
  return routingState
}

// ==========================================
// HOOKS PÚBLICOS
// ==========================================

/**
 * Hook para monitorar o estado completo de routing
 */
export function useLightningRouting(): RoutingServiceState {
  return useSyncExternalStore(subscribeToRoutingState, getRoutingState)
}

/**
 * Hook para monitorar apenas o modo de routing atual
 */
export function useRoutingMode(): RoutingMode {
  const { currentMode } = useLightningRouting()
  return currentMode
}

/**
 * Hook para verificar se local routing está disponível
 */
export function useLocalRoutingAvailable(): boolean {
  const { isLocalRoutingAvailable } = useLightningRouting()
  return isLocalRoutingAvailable
}

/**
 * Hook para obter estatísticas detalhadas de routing
 */
export function useRoutingStats(): {
  currentMode: RoutingMode
  isLocalRoutingAvailable: boolean
  backgroundSyncState: string
  lastModeSwitch: number
} {
  const state = useLightningRouting()

  return {
    currentMode: state.currentMode,
    isLocalRoutingAvailable: state.isLocalRoutingAvailable,
    backgroundSyncState: state.backgroundSyncState,
    lastModeSwitch: state.lastModeSwitch,
  }
}
