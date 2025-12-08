/**
 * WalletChangeHandler
 *
 * Componente que reage à mudança de wallet ativa e dispara o discover de endereços.
 * Deve ficar dentro da hierarquia de providers após AppProvider e NetworkProvider.
 *
 * FLUXO QUANDO WALLET MUDA:
 * 1. Detecta mudança de activeWalletId
 * 2. Seta loading imediatamente (feedback visual)
 * 3. Limpa cache do addressStore (mostra skeleton)
 * 4. Aguarda animação do modal (InteractionManager)
 * 5. Faz refresh leve (lê MMKV sem derivação pesada)
 * 6. Dispara discover na rede
 * 7. Notifica addressStore com dados atualizados
 * 8. Remove loading
 */

import { useEffect, useRef, useCallback } from 'react'
import { InteractionManager } from 'react-native'
import { useNetworkConnection } from '../app-provider/AppProvider'
import { useActiveWalletId, useAppContext } from '../app-provider'
import { addressService } from '@/core/services'

export default function WalletChangeHandler() {
  const getConnection = useNetworkConnection()
  const activeWalletId = useActiveWalletId()
  const { dispatch, address } = useAppContext()

  const previousWalletIdRef = useRef<string | undefined>(activeWalletId)
  const isLoadingRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const connection = await getConnection()
      await addressService.discover(connection)

      // Após discover, notifica subscribers com cache completo
      address.notify()
    } catch (error) {
      console.error('[WalletChangeHandler] Error refreshing addresses:', error)
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { key: 'addresses', loading: false } })
      isLoadingRef.current = false
    }
  }, [getConnection, address, dispatch])

  // Quando a carteira ativa muda, atualiza o cache e faz refresh
  useEffect(() => {
    // Se a carteira mudou
    if (previousWalletIdRef.current !== activeWalletId) {
      previousWalletIdRef.current = activeWalletId

      if (activeWalletId) {
        // Aguarda animação do modal terminar
        const handle = InteractionManager.runAfterInteractions(() => {
          // 1. Seta loading PRIMEIRO (mostra skeleton imediatamente)
          dispatch({ type: 'SET_LOADING', payload: { key: 'addresses', loading: true } })
          isLoadingRef.current = true

          // 2. Limpa cache e notifica (UI mostra skeleton com dados vazios)
          address.clear()

          // 3. Faz refresh leve (lê MMKV, sem derivação pesada) em próximo frame
          requestAnimationFrame(() => {
            address.notifyLight()

            // 4. Dispara fetch da rede (async)
            refresh()
          })
        })
        return () => handle.cancel()
      } else {
        // Sem wallet ativa, apenas limpa o cache
        address.clear()
        address.notify()
      }
    }
  }, [activeWalletId, refresh, address, dispatch])

  // Este componente não renderiza nada
  return null
}
