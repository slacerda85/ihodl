import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { getTxHistory } from '@/lib/transactions'
import { Tx } from '@/models/transaction'
import { processWalletTransactions, ProcessedUTXO } from '@/lib/utxo'
import { StateCreator } from 'zustand'
import { StoreState } from './useStorage'

/**
 * Estrutura simplificada que armazena apenas as transações brutas
 * Todo o processamento (saldo, UTXOs, análise) é feito dinamicamente
 */
type WalletTransactionCache = {
  walletId: string
  transactions: Tx[] // Apenas as transações brutas
  addresses: string[] // Endereços da carteira para facilitar processamento
  lastUpdated: number
}

type TransactionsState = {
  walletCaches: WalletTransactionCache[]
  loadingTxState: boolean
}

type TransactionsActions = {
  setLoadingTransactions: (loading: boolean) => void
  fetchTransactions: (walletId: string) => Promise<void>
  getBalance: (walletId: string) => number
  getUtxos: (walletId: string) => ProcessedUTXO[]
  getTransactionAnalysis: (walletId: string) => ReturnType<typeof processWalletTransactions> | null
  clearWalletCache: (walletId: string) => void
  initializeActiveWalletTransactions: () => Promise<void>
}

export type TxStorage = {
  tx: TransactionsState & TransactionsActions
}

const createTxStorage: StateCreator<StoreState, [['zustand/persist', unknown]], [], TxStorage> = (
  set,
  get,
) => {
  console.log('🏗️ [createTxStorage] Criando store de transações...')

  const txStore = {
    // state - apenas cache das transações brutas
    walletCaches: [],
    loadingTxState: false,

    // actions
    setLoadingTransactions: (loading: boolean) => {
      set(state => ({
        tx: { ...state.tx, loadingTxState: loading },
      }))
    },

    fetchTransactions: async (walletId: string) => {
      console.log('🔄 [fetchTransactions] Iniciando fetch para walletId:', walletId)

      const { setLoadingTransactions, walletCaches } = get().tx
      setLoadingTransactions(true)
      console.log('⏳ [fetchTransactions] Loading state definido como true')

      try {
        // Buscar seed phrase da carteira
        console.log('🔍 [fetchTransactions] Buscando wallet na store...')
        const { wallets } = get()
        console.log('📋 [fetchTransactions] Total de wallets na store:', wallets.length)

        const wallet = wallets.find(w => w.walletId === walletId)
        if (!wallet) {
          console.error('❌ [fetchTransactions] Wallet não encontrada para ID:', walletId)
          throw new Error('Wallet not found')
        }
        console.log('✅ [fetchTransactions] Wallet encontrada:', {
          walletId: wallet.walletId,
          hasSeedPhrase: !!wallet.seedPhrase,
        })

        // Buscar transações usando o método existente
        console.log('🔐 [fetchTransactions] Criando chave raiz a partir da seed phrase...')
        const rootExtendedKey = createRootExtendedKey(fromMnemonic(wallet.seedPhrase))
        console.log('✅ [fetchTransactions] Chave raiz criada com sucesso')

        console.log('🌐 [fetchTransactions] Iniciando getTxHistory...')
        const { txHistory } = await getTxHistory({
          extendedKey: rootExtendedKey,
        })
        console.log(
          '📊 [fetchTransactions] getTxHistory concluído. Número de endereços retornados:',
          txHistory.length,
        )

        // Extrair todas as transações e endereços
        const allTransactions: Tx[] = []
        const allAddresses: string[] = []

        console.log('🔄 [fetchTransactions] Processando dados dos endereços...')
        for (const addressData of txHistory) {
          console.log('📍 [fetchTransactions] Processando endereço:', {
            receiving: addressData.receivingAddress,
            change: addressData.changeAddress,
            txCount: addressData.txs.length,
          })

          allAddresses.push(addressData.receivingAddress, addressData.changeAddress)
          allTransactions.push(...addressData.txs)
        }

        console.log('📈 [fetchTransactions] Dados extraídos:', {
          totalTransactions: allTransactions.length,
          totalAddresses: allAddresses.length,
        })

        // Remover transações duplicadas
        const uniqueTransactions = Array.from(
          new Map(allTransactions.map(tx => [tx.txid, tx])).values(),
        )
        console.log(
          '🔧 [fetchTransactions] Transações após remoção de duplicatas:',
          uniqueTransactions.length,
        )

        // Verificar se este cache já existe
        const existingCacheIndex = walletCaches.findIndex(c => c.walletId === walletId)
        console.log(
          '💾 [fetchTransactions] Cache existente encontrado?',
          existingCacheIndex >= 0 ? `Sim (índice: ${existingCacheIndex})` : 'Não',
        )

        const uniqueAddresses = [...new Set(allAddresses)]
        console.log('📍 [fetchTransactions] Endereços únicos:', uniqueAddresses.length)

        set(state => {
          const newWalletCaches = [...state.tx.walletCaches]

          const newCache: WalletTransactionCache = {
            walletId,
            transactions: uniqueTransactions,
            addresses: uniqueAddresses,
            lastUpdated: Date.now(),
          }

          if (existingCacheIndex >= 0) {
            // Atualizar cache existente
            console.log('🔄 [fetchTransactions] Atualizando cache existente')
            newWalletCaches[existingCacheIndex] = newCache
          } else {
            // Adicionar novo cache
            console.log('➕ [fetchTransactions] Adicionando novo cache')
            newWalletCaches.push(newCache)
          }

          console.log(
            '💾 [fetchTransactions] Cache atualizado. Total de caches:',
            newWalletCaches.length,
          )

          return {
            tx: {
              ...state.tx,
              walletCaches: newWalletCaches,
            },
          }
        })

        console.log('✅ [fetchTransactions] Fetch concluído com sucesso para walletId:', walletId)
      } catch (error) {
        console.error('❌ [fetchTransactions] Erro durante o fetch:', error)
        if (error instanceof Error) {
          console.error('📝 [fetchTransactions] Detalhes do erro:', {
            message: error.message,
            stack: error.stack,
          })
        }
      } finally {
        setLoadingTransactions(false)
        console.log('⏹️ [fetchTransactions] Loading state definido como false')
      }
    },

    // Computed values - tudo calculado dinamicamente
    getBalance: (walletId: string) => {
      console.log('💰 [getBalance] Calculando saldo para walletId:', walletId)

      const { walletCaches } = get().tx
      const cache = walletCaches.find(c => c.walletId === walletId)
      console.log('🔍 [getBalance] Cache encontrado?', !!cache)

      if (!cache) {
        console.log('❌ [getBalance] Cache não encontrado, retornando saldo 0')
        return 0
      }

      console.log('📊 [getBalance] Dados do cache:', {
        transactionCount: cache.transactions.length,
        addressCount: cache.addresses.length,
        lastUpdated: new Date(cache.lastUpdated).toISOString(),
      })

      const walletAddresses = new Set(cache.addresses)
      console.log(
        '🏠 [getBalance] Processando transações com',
        walletAddresses.size,
        'endereços únicos',
      )

      const { balance } = processWalletTransactions(cache.transactions, walletAddresses)
      console.log('✅ [getBalance] Saldo calculado:', balance)

      return balance
    },

    getUtxos: (walletId: string) => {
      console.log('🔗 [getUtxos] Buscando UTXOs para walletId:', walletId)

      const { walletCaches } = get().tx
      const cache = walletCaches.find(c => c.walletId === walletId)
      console.log('🔍 [getUtxos] Cache encontrado?', !!cache)

      if (!cache) {
        console.log('❌ [getUtxos] Cache não encontrado, retornando array vazio')
        return []
      }

      const walletAddresses = new Set(cache.addresses)
      const { utxos } = processWalletTransactions(cache.transactions, walletAddresses)
      console.log('✅ [getUtxos] UTXOs encontrados:', utxos.length)

      return utxos
    },

    getTransactionAnalysis: (walletId: string) => {
      console.log('📊 [getTransactionAnalysis] Analisando transações para walletId:', walletId)

      const { walletCaches } = get().tx
      const cache = walletCaches.find(c => c.walletId === walletId)
      console.log('🔍 [getTransactionAnalysis] Cache encontrado?', !!cache)

      if (!cache) {
        console.log('❌ [getTransactionAnalysis] Cache não encontrado, retornando null')
        return null
      }

      const walletAddresses = new Set(cache.addresses)
      const analysis = processWalletTransactions(cache.transactions, walletAddresses)
      console.log('✅ [getTransactionAnalysis] Análise concluída:', {
        balance: analysis.balance,
        utxoCount: analysis.utxos.length,
        transactionCount: cache.transactions.length,
      })

      return analysis
    },

    initializeActiveWalletTransactions: async () => {
      console.log(
        '🚀 [initializeActiveWalletTransactions] Inicializando busca de transações do app...',
      )

      const { activeWalletId } = get()

      if (!activeWalletId) {
        console.log('ℹ️ [initializeActiveWalletTransactions] Nenhuma carteira ativa encontrada')
        return
      }

      console.log(
        '🎯 [initializeActiveWalletTransactions] Carteira ativa encontrada:',
        activeWalletId,
      )

      // Verificar se já existe cache para esta carteira
      const { walletCaches } = get().tx
      const existingCache = walletCaches.find(c => c.walletId === activeWalletId)

      if (existingCache) {
        const cacheAge = Date.now() - existingCache.lastUpdated
        const fiveMinutes = 5 * 60 * 1000 // 5 minutos em ms

        if (cacheAge < fiveMinutes) {
          console.log(
            '✅ [initializeActiveWalletTransactions] Cache ainda válido, não recarregando',
          )
          return
        } else {
          console.log('🔄 [initializeActiveWalletTransactions] Cache expirado, recarregando...')
        }
      } else {
        console.log(
          '➕ [initializeActiveWalletTransactions] Nenhum cache encontrado, carregando pela primeira vez...',
        )
      }

      try {
        const { fetchTransactions } = get().tx
        await fetchTransactions(activeWalletId)
        console.log('✅ [initializeActiveWalletTransactions] Inicialização concluída com sucesso')
      } catch (error) {
        console.error('❌ [initializeActiveWalletTransactions] Erro durante inicialização:', error)
      }
    },

    clearWalletCache: (walletId: string) => {
      set(state => ({
        tx: {
          ...state.tx,
          walletCaches: state.tx.walletCaches.filter(c => c.walletId !== walletId),
        },
      }))
    },
  }

  console.log('✅ [createTxStorage] Store de transações criado com funções:', Object.keys(txStore))

  return { tx: txStore }
}

export default createTxStorage
