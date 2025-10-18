import { useEffect } from 'react'
import useStorage from './useStorage'
import { updateTrustedPeers } from '@/lib/electrum'

/**
 * Hook para inicializar automaticamente as transações da carteira ativa
 * quando o app carrega. Deve ser usado em componentes de nível superior.
 */
export function useInitialize() {
  const activeWalletId = useStorage(state => state.activeWalletId)
  const fetchTransactions = useStorage(state => state.tx.fetchTransactions)
  const fetchMempoolTransactions = useStorage(state => state.tx.fetchMempoolTransactions)

  useEffect(() => {
    console.log('🚀 [useInitialize] Executando inicialização do app...')

    const tryInitialize = async () => {
      if (!activeWalletId) {
        console.log('⚠️ [useInitialize] Nenhuma carteira ativa, pulando busca de transações')
        return
      }

      try {
        console.log('✅ [useInitialize] Carteira ativa encontrada, buscando transações...')
        await fetchTransactions(activeWalletId)
        console.log('✅ [useInitialize] Busca de transações concluída')
      } catch (error) {
        console.error('❌ [useInitialize] Erro na busca de transações:', error)
      }

      // Verificar transações pendentes na mempool
      if (
        activeWalletId &&
        fetchMempoolTransactions &&
        typeof fetchMempoolTransactions === 'function'
      ) {
        try {
          console.log('🔍 [useInitialize] Verificando transações na mempool...')
          await fetchMempoolTransactions(activeWalletId)
          console.log('✅ [useInitialize] Verificação de mempool concluída')
        } catch (error) {
          console.error('❌ [useInitialize] Erro na verificação de mempool:', error)
        }
      } else {
        console.warn('⚠️ [useInitialize] Função de fetch de mempool não disponível')
      }
    }

    // Pequeno delay para garantir que o store esteja totalmente carregado
    const timer = setTimeout(async () => {
      // Atualizar lista de peers confiáveis
      try {
        await updateTrustedPeers()
        console.log('✅ [useInitialize] Atualização de peers confiáveis concluída')
      } catch (error) {
        console.error('❌ [useInitialize] Erro na atualização de peers:', error)
      }

      // Inicializar transações da carteira ativa
      await tryInitialize()
    }, 2000) // Aumentei para 2 segundos

    return () => clearTimeout(timer)
  }, [activeWalletId, fetchTransactions, fetchMempoolTransactions])
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
