/**
 * Hooks para acessar ações Lightning
 *
 * Estes hooks retornam funções estáveis (não mudam entre renders)
 * para evitar re-renders desnecessários em componentes filhos
 */

import { useLightningActions as useAppLightningActions } from '@/ui/features/app-provider'

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
  return useAppLightningActions()
}

/**
 * Hook para ações de invoice
 */
export function useInvoiceActions() {
  const actions = useAppLightningActions()
  return {
    generateInvoice: actions.generateInvoice,
    decodeInvoice: actions.decodeInvoice,
    refreshInvoices: actions.refreshInvoices,
  }
}

/**
 * Hook para ações de pagamento
 */
export function usePaymentActions() {
  const actions = useAppLightningActions()
  return { sendPayment: actions.sendPayment, refreshPayments: actions.refreshPayments }
}

/**
 * Hook para ações de saldo
 */
export function useBalanceActions() {
  const actions = useAppLightningActions()
  return { getBalance: actions.getBalance, refreshBalance: actions.refreshBalance }
}

/**
 * Hook para ações de canal
 */
export function useChannelActions() {
  const actions = useAppLightningActions()
  return {
    getChannels: actions.getChannels,
    hasChannels: actions.hasChannels,
    createChannel: actions.createChannel,
    closeChannel: actions.closeChannel,
    forceCloseChannel: actions.forceCloseChannel,
  }
}

/**
 * Hook para ações de conexão (BOLT1)
 */
export function useConnectionActions() {
  const actions = useAppLightningActions()
  return {
    connectToPeer: actions.connectToPeer,
    disconnect: actions.disconnect,
    sendPing: actions.sendPing,
  }
}
