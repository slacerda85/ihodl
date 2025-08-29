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
      const { setLoadingTransactions, walletCaches } = get().tx
      setLoadingTransactions(true)

      try {
        // Buscar seed phrase da carteira
        const { wallets } = get()
        const wallet = wallets.find(w => w.walletId === walletId)
        if (!wallet) {
          throw new Error('Wallet not found')
        }

        // Buscar transações usando o método existente
        const rootExtendedKey = createRootExtendedKey(fromMnemonic(wallet.seedPhrase))
        const { txHistory } = await getTxHistory({
          extendedKey: rootExtendedKey,
        })

        // Extrair todas as transações e endereços
        const allTransactions: Tx[] = []
        const allAddresses: string[] = []

        for (const addressData of txHistory) {
          allAddresses.push(addressData.receivingAddress, addressData.changeAddress)
          allTransactions.push(...addressData.txs)
        }

        // Remover transações duplicadas
        const uniqueTransactions = Array.from(
          new Map(allTransactions.map(tx => [tx.txid, tx])).values(),
        )

        // Verificar se este cache já existe
        const existingCacheIndex = walletCaches.findIndex(c => c.walletId === walletId)

        const uniqueAddresses = [...new Set(allAddresses)]

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
            newWalletCaches[existingCacheIndex] = newCache
          } else {
            // Adicionar novo cache
            newWalletCaches.push(newCache)
          }

          return {
            tx: {
              ...state.tx,
              walletCaches: newWalletCaches,
            },
          }
        })
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
      }
    },

    // Computed values - tudo calculado dinamicamente
    getBalance: (walletId: string) => {
      const { walletCaches } = get().tx
      const cache = walletCaches.find(c => c.walletId === walletId)

      if (!cache) {
        return 0
      }

      const walletAddresses = new Set(cache.addresses)
      const { balance } = processWalletTransactions(cache.transactions, walletAddresses)

      return balance
    },

    getUtxos: (walletId: string) => {
      const { walletCaches } = get().tx
      const cache = walletCaches.find(c => c.walletId === walletId)

      if (!cache) {
        return []
      }

      const walletAddresses = new Set(cache.addresses)
      const { utxos } = processWalletTransactions(cache.transactions, walletAddresses)

      return utxos
    },

    getTransactionAnalysis: (walletId: string) => {
      const { walletCaches } = get().tx
      const cache = walletCaches.find(c => c.walletId === walletId)

      if (!cache) {
        return null
      }

      const walletAddresses = new Set(cache.addresses)
      const analysis = processWalletTransactions(cache.transactions, walletAddresses)

      return analysis
    },

    initializeActiveWalletTransactions: async () => {
      const { activeWalletId } = get()

      if (!activeWalletId) {
        return
      }

      // Verificar se já existe cache para esta carteira
      const { walletCaches } = get().tx
      const existingCache = walletCaches.find(c => c.walletId === activeWalletId)

      if (existingCache) {
        const cacheAge = Date.now() - existingCache.lastUpdated
        const fiveMinutes = 5 * 60 * 1000 // 5 minutos em ms

        if (cacheAge < fiveMinutes) {
          return
        }
      }

      try {
        const { fetchTransactions } = get().tx
        await fetchTransactions(activeWalletId)
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

  // Verificar se todas as funções foram criadas corretamente
  const requiredFunctions = [
    'fetchTransactions',
    'getBalance',
    'getUtxos',
    'getTransactionAnalysis',
  ]
  for (const funcName of requiredFunctions) {
    const func = (txStore as any)[funcName]
    if (typeof func !== 'function') {
      console.error(`❌ [createTxStorage] Função ${funcName} não foi criada corretamente!`)
    }
  }

  return { tx: txStore }
}

export default createTxStorage
