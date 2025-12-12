/**
 * Hook para TrafficControl
 *
 * Hook React para usar o LightningTrafficControlService
 */

import { useEffect, useState, useCallback } from 'react'
import {
  getTrafficControl,
  type TrafficControlState,
  type LightningTrafficControlService,
} from '@/core/services/ln-traffic-control-service'

/**
 * Hook para acessar o estado do TrafficControl
 *
 * @returns Estado atual do TrafficControl
 */
export function useTrafficControl(): TrafficControlState & {
  canConnect: boolean
  service: LightningTrafficControlService
} {
  const service = getTrafficControl()
  const [state, setState] = useState<TrafficControlState>(() => service.getState())

  useEffect(() => {
    const handleStateChanged = (newState: TrafficControlState) => {
      setState(newState)
    }

    service.on('stateChanged', handleStateChanged)

    return () => {
      service.off('stateChanged', handleStateChanged)
    }
  }, [service])

  return {
    ...state,
    canConnect: service.canConnect,
    service,
  }
}

/**
 * Hook para monitorar se pode conectar
 *
 * @returns Booleano indicando se pode conectar
 */
export function useCanConnect(): boolean {
  const { canConnect } = useTrafficControl()
  return canConnect
}

/**
 * Hook para controlar disponibilidade da carteira
 *
 * @returns Funções para controlar disponibilidade da carteira
 */
export function useWalletAvailability() {
  const service = getTrafficControl()

  const setWalletAvailable = useCallback(
    (available: boolean) => {
      service.setWalletAvailability(available)
    },
    [service],
  )

  return {
    setWalletAvailable,
    isWalletAvailable: service.walletIsAvailable,
  }
}

/**
 * Hook para controlar contador de desconexões
 *
 * @returns Funções para controlar contador de desconexões
 */
export function useDisconnectCount() {
  const service = getTrafficControl()

  const increment = useCallback(
    (reason?: string) => {
      // Como o serviço tem DisconnectReason enum, vamos usar um valor padrão
      service.incrementDisconnectCount('manual_disconnect' as any)
    },
    [service],
  )

  const decrement = useCallback(
    (reason?: string) => {
      service.decrementDisconnectCount('manual_connect' as any)
    },
    [service],
  )

  const reset = useCallback(() => {
    service.resetDisconnectCount()
  }, [service])

  return {
    count: service.disconnectCount,
    increment,
    decrement,
    reset,
  }
}
