/**
 * Hooks para acessar partes específicas do estado Lightning
 *
 * Estes hooks permitem que componentes se inscrevam apenas nas partes
 * do estado que realmente precisam, otimizando re-renders
 */

import { useLightningState as useAppLightningState } from '@/ui/features/app-provider'
import type {
  LightningState,
  ConnectionState,
  Channel,
  Invoice,
  Payment,
  Millisatoshis,
} from '../types'

/**
 * Hook para acessar estado completo do Lightning
 * Use com cautela - causa re-render em qualquer mudança de estado
 */
export function useLightningState(): LightningState {
  return useAppLightningState()
}

/**
 * Hook para acessar estado de conexão BOLT1
 */
export function useConnectionState(): ConnectionState {
  const state = useAppLightningState()
  return state.connection
}

/**
 * Hook para verificar se Lightning está inicializado
 */
export function useLightningInitialized(): boolean {
  const state = useAppLightningState()
  return state.isInitialized
}

/**
 * Hook para verificar se está carregando
 */
export function useLightningLoading(): boolean {
  const state = useAppLightningState()
  return state.isLoading
}

/**
 * Hook para acessar erro atual
 */
export function useLightningError(): string | null {
  const state = useAppLightningState()
  return state.error
}

/**
 * Hook para acessar saldo total
 */
export function useLightningBalance(): Millisatoshis {
  const state = useAppLightningState()
  return state.totalBalance
}

/**
 * Hook para acessar lista de canais
 */
export function useLightningChannels(): Channel[] {
  const state = useAppLightningState()
  return state.channels
}

/**
 * Hook para verificar se há canais ativos
 */
export function useHasActiveChannels(): boolean {
  const state = useAppLightningState()
  return state.hasActiveChannels
}

/**
 * Hook para acessar lista de invoices
 */
export function useLightningInvoices(): Invoice[] {
  const state = useAppLightningState()
  return state.invoices
}

/**
 * Hook para acessar lista de pagamentos
 */
export function useLightningPayments(): Payment[] {
  const state = useAppLightningState()
  return state.payments
}

/**
 * Hook para verificar se está conectado a um peer
 */
export function useIsConnected(): boolean {
  const state = useAppLightningState()
  return state.connection.isConnected
}
