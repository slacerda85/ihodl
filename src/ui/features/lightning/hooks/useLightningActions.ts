/**
 * Hooks para acessar ações Lightning
 *
 * Estes hooks retornam funções estáveis (não mudam entre renders)
 * para evitar re-renders desnecessários em componentes filhos
 */

import { useLightningContext } from './useLightningContext'
import type { LightningActions } from '../context'

/**
 * Hook para acessar todas as ações Lightning
 *
 * As funções retornadas são estáveis e não causam re-renders
 *
 * @example
 * ```tsx
 * function PayButton() {
 *   const { sendPayment } = useLightningActions()
 *   return <Button onPress={() => sendPayment(invoice)} />
 * }
 * ```
 */
export function useLightningActions(): LightningActions {
  const context = useLightningContext()

  // Retorna apenas as ações, não o estado
  return {
    initialize: context.initialize,
    generateInvoice: context.generateInvoice,
    decodeInvoice: context.decodeInvoice,
    sendPayment: context.sendPayment,
    getBalance: context.getBalance,
    refreshBalance: context.refreshBalance,
    getChannels: context.getChannels,
    hasChannels: context.hasChannels,
    createChannel: context.createChannel,
    closeChannel: context.closeChannel,
    forceCloseChannel: context.forceCloseChannel,
    refreshInvoices: context.refreshInvoices,
    refreshPayments: context.refreshPayments,
    connectToPeer: context.connectToPeer,
    disconnect: context.disconnect,
    sendPing: context.sendPing,
  }
}

/**
 * Hook para ações de invoice
 */
export function useInvoiceActions() {
  const { generateInvoice, decodeInvoice, refreshInvoices } = useLightningContext()
  return { generateInvoice, decodeInvoice, refreshInvoices }
}

/**
 * Hook para ações de pagamento
 */
export function usePaymentActions() {
  const { sendPayment, refreshPayments } = useLightningContext()
  return { sendPayment, refreshPayments }
}

/**
 * Hook para ações de saldo
 */
export function useBalanceActions() {
  const { getBalance, refreshBalance } = useLightningContext()
  return { getBalance, refreshBalance }
}

/**
 * Hook para ações de canal
 */
export function useChannelActions() {
  const { getChannels, hasChannels, createChannel, closeChannel, forceCloseChannel } =
    useLightningContext()
  return { getChannels, hasChannels, createChannel, closeChannel, forceCloseChannel }
}

/**
 * Hook para ações de conexão (BOLT1)
 */
export function useConnectionActions() {
  const { connectToPeer, disconnect, sendPing } = useLightningContext()
  return { connectToPeer, disconnect, sendPing }
}
