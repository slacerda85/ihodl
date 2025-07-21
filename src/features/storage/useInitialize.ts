import { useEffect } from 'react'
import useStorage from './useStorage'

/**
 * Hook para inicializar automaticamente as transações da carteira ativa
 * quando o app carrega. Deve ser usado em componentes de nível superior.
 */
export function useInitialize() {
  const initializeActiveWalletTransactions = useStorage(
    state => state.tx.initializeActiveWalletTransactions,
  )

  useEffect(() => {
    console.log('🚀 [useInitialize] Executando inicialização do app...')

    if (initializeActiveWalletTransactions) {
      // Pequeno delay para garantir que o store esteja totalmente carregado
      const timer = setTimeout(() => {
        initializeActiveWalletTransactions().catch(error => {
          console.error('❌ [useInitialize] Erro na inicialização:', error)
        })
      }, 500)

      return () => clearTimeout(timer)
    } else {
      console.warn('⚠️ [useInitialize] Função de inicialização não disponível')
    }
  }, [initializeActiveWalletTransactions])
}

/**
 * Hook para forçar o recarregamento das transações da carteira ativa
 * independente do cache
 */
export function useForceRefresh() {
  const activeWalletId = useStorage(state => state.activeWalletId)
  const fetchTransactions = useStorage(state => state.tx.fetchTransactions)

  const forceRefresh = async () => {
    if (activeWalletId && fetchTransactions) {
      console.log('🔄 [useForceRefresh] Forçando atualização das transações...')
      try {
        await fetchTransactions(activeWalletId)
        console.log('✅ [useForceRefresh] Atualização forçada concluída')
      } catch (error) {
        console.error('❌ [useForceRefresh] Erro na atualização forçada:', error)
        throw error
      }
    } else {
      console.warn('⚠️ [useForceRefresh] Carteira ativa ou função de fetch não disponível')
    }
  }

  return { forceRefresh, activeWalletId, canRefresh: !!(activeWalletId && fetchTransactions) }
}
