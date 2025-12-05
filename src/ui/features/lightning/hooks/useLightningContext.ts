/**
 * Hook para acessar o contexto Lightning
 *
 * Fornece acesso tipado ao estado e ações do LightningProvider
 */

import { useContext } from 'react'
import { LightningContext, type LightningContextType } from '../context'

/**
 * Hook principal para acessar o contexto Lightning
 *
 * @throws Error se usado fora do LightningProvider
 * @returns Contexto Lightning com estado e ações
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { state, generateInvoice } = useLightningContext()
 *
 *   if (state.isLoading) return <Loading />
 *
 *   return <Button onPress={() => generateInvoice(1000n)} />
 * }
 * ```
 */
export function useLightningContext(): LightningContextType {
  const context = useContext(LightningContext)

  if (!context) {
    throw new Error('useLightningContext must be used within a LightningProvider')
  }

  return context
}
