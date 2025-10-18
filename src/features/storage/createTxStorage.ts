import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { getTxHistory } from '@/lib/transactions'
import { Tx } from '@/models/transaction'
import { processWalletTransactions, UTXO } from '@/lib/utxo'
import { StateCreator } from 'zustand'
import { StoreState } from './useStorage'
import { getMempoolTransactions } from '@/lib/electrum'

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

type PendingTransaction = {
  txid: string
  walletId: string
  recipientAddress: string
  amount: number // em satoshis
  fee: number // em satoshis
  timestamp: number
  txHex: string
}

type TransactionsState = {
  walletCaches: WalletTransactionCache[]
  pendingTransactions: PendingTransaction[]
  loadingTxState: boolean
  loadingMempoolState: boolean
  mempoolTransactions: Tx[]
}

type TransactionsActions = {
  setLoadingTransactions: (loading: boolean) => void
  setLoadingMempool: (loading: boolean) => void
  fetchTransactions: (walletId: string) => Promise<void>
  fetchMempoolTransactions: (walletId: string) => Promise<void>
  getBalance: (walletId: string) => number
  getUtxos: (walletId: string) => UTXO[]
  getTransactionAnalysis: (walletId: string) => ReturnType<typeof processWalletTransactions> | null
  getMempoolTransactions: () => Tx[]
  clearWalletCache: (walletId: string) => void
  initializeActiveWalletTransactions: () => Promise<void>
  addPendingTransaction: (tx: Omit<PendingTransaction, 'timestamp'>) => void
  removePendingTransaction: (txid: string) => void
  getPendingTransactions: (walletId: string) => PendingTransaction[]
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
    pendingTransactions: [],
    loadingTxState: false,
    loadingMempoolState: false,
    mempoolTransactions: [],

    // actions
    setLoadingTransactions: (loading: boolean) => {
      set(state => ({
        tx: { ...state.tx, loadingTxState: loading },
      }))
    },

    setLoadingMempool: (loading: boolean) => {
      set(state => ({
        tx: { ...state.tx, loadingMempoolState: loading },
      }))
    },

    fetchTransactions: async (walletId: string) => {
      console.log(`🔄 [fetchTransactions] Iniciando busca de transações para wallet: ${walletId}`)
      const { setLoadingTransactions, walletCaches } = get().tx
      setLoadingTransactions(true)

      try {
        // Buscar seed phrase da carteira
        console.log(`🔍 [fetchTransactions] Buscando wallet no storage...`)
        const { wallets } = get()
        const wallet = wallets.find(w => w.walletId === walletId)
        if (!wallet) {
          console.error(`❌ [fetchTransactions] Wallet ${walletId} não encontrada`)
          throw new Error('Wallet not found')
        }
        console.log(`✅ [fetchTransactions] Wallet encontrada: ${wallet.walletId}`)

        // Buscar transações usando o método existente
        console.log(`📡 [fetchTransactions] Criando extended key...`)
        const rootExtendedKey = createRootExtendedKey(fromMnemonic(wallet.seedPhrase))
        console.log(`📡 [fetchTransactions] Chamando getTxHistory...`)
        const { txHistory } = await getTxHistory({
          extendedKey: rootExtendedKey,
        })
        console.log(`📡 [fetchTransactions] getTxHistory retornou ${txHistory.length} endereços`)

        // Extrair todas as transações e endereços
        console.log(
          `🔧 [fetchTransactions] Processando ${txHistory.length} endereços do txHistory...`,
        )
        const allTransactions: Tx[] = []
        const allAddresses: string[] = []

        for (const addressData of txHistory) {
          allAddresses.push(addressData.receivingAddress, addressData.changeAddress)
          allTransactions.push(...addressData.txs)
        }
        console.log(
          `🔧 [fetchTransactions] Extraído ${allTransactions.length} transações brutas e ${allAddresses.length} endereços do txHistory`,
        )

        // Adicionar addresses do addressCache para garantir que addresses não fica vazio
        console.log(`🔧 [fetchTransactions] Verificando addressCache...`)
        const addressCache = get().getAddressCache(walletId)
        if (addressCache) {
          const cacheAddressesCount =
            1 + addressCache.usedReceivingAddresses.length + addressCache.usedChangeAddresses.length
          allAddresses.push(
            addressCache.nextUnusedAddress,
            ...addressCache.usedReceivingAddresses,
            ...addressCache.usedChangeAddresses,
          )
          console.log(
            `✅ [fetchTransactions] Adicionados ${cacheAddressesCount} endereços do addressCache`,
          )
        } else {
          console.log(`⚠️ [fetchTransactions] AddressCache não encontrado para wallet ${walletId}`)
        }

        // Remover transações duplicadas
        console.log(`🔧 [fetchTransactions] Removendo transações duplicadas...`)
        const uniqueTransactions = Array.from(
          new Map(allTransactions.map(tx => [tx.txid, tx])).values(),
        )
        console.log(
          `✅ [fetchTransactions] ${allTransactions.length} -> ${uniqueTransactions.length} transações únicas`,
        )

        // Verificar se este cache já existe
        const existingCacheIndex = walletCaches.findIndex(c => c.walletId === walletId)
        const uniqueAddresses = [...new Set(allAddresses)]
        console.log(
          `✅ [fetchTransactions] Preparado cache: ${uniqueTransactions.length} txs, ${uniqueAddresses.length} endereços`,
        )

        set(state => {
          const newWalletCaches = [...state.tx.walletCaches]

          const newCache: WalletTransactionCache = {
            walletId,
            transactions: uniqueTransactions,
            addresses: uniqueAddresses,
            lastUpdated: Date.now(),
          }

          if (existingCacheIndex >= 0) {
            console.log(`🔄 [fetchTransactions] Atualizando cache existente`)
            newWalletCaches[existingCacheIndex] = newCache
          } else {
            console.log(`🆕 [fetchTransactions] Criando novo cache`)
            newWalletCaches.push(newCache)
          }

          return {
            tx: {
              ...state.tx,
              walletCaches: newWalletCaches,
            },
          }
        })
        console.log(`✅ [fetchTransactions] Cache atualizado com sucesso para wallet ${walletId}`)
      } catch (error) {
        console.error(`❌ [fetchTransactions] Erro durante o fetch para wallet ${walletId}:`, error)
        if (error instanceof Error) {
          console.error('📝 [fetchTransactions] Detalhes do erro:', {
            message: error.message,
            stack: error.stack,
          })
        }
      } finally {
        console.log(`🏁 [fetchTransactions] Finalizando fetch para wallet ${walletId}`)
        setLoadingTransactions(false)
      }
    },

    fetchMempoolTransactions: async (walletId: string) => {
      console.log(
        `🔄 [fetchMempoolTransactions] Iniciando busca de transações na mempool para wallet: ${walletId}`,
      )
      const { setLoadingMempool } = get().tx
      setLoadingMempool(true)

      try {
        // Get wallet addresses from cache
        const addressCache = get().getAddressCache(walletId)
        if (!addressCache) {
          console.log('[fetchMempoolTransactions] No address cache found for wallet:', walletId)
          return
        }

        const addresses = [
          addressCache.nextUnusedAddress,
          ...addressCache.usedReceivingAddresses,
          ...addressCache.usedChangeAddresses,
        ].filter(addr => typeof addr === 'string' && addr.trim()) // Filter out any non-string or empty addresses

        if (addresses.length === 0) {
          console.log('[fetchMempoolTransactions] No valid addresses found for wallet:', walletId)
          return
        }

        console.log(
          `[fetchMempoolTransactions] Fetching mempool transactions for ${addresses.length} addresses:`,
          addresses,
        )
        const mempoolTxs = await getMempoolTransactions(addresses)
        console.log(`[fetchMempoolTransactions] Found ${mempoolTxs.length} mempool transactions`)

        // Store mempool transactions in state
        set(state => ({
          tx: {
            ...state.tx,
            mempoolTransactions: mempoolTxs,
          },
        }))

        console.log(
          `✅ [fetchMempoolTransactions] Mempool transactions processed for wallet ${walletId}`,
        )
      } catch (error) {
        console.error(
          `❌ [fetchMempoolTransactions] Error fetching mempool transactions for wallet ${walletId}:`,
          error,
        )
      } finally {
        console.log(`🏁 [fetchMempoolTransactions] Finalizing mempool fetch for wallet ${walletId}`)
        setLoadingMempool(false)
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

    getMempoolTransactions: () => {
      const { mempoolTransactions } = get().tx
      return mempoolTransactions
    },

    initializeActiveWalletTransactions: async () => {
      console.log('🚀 [initializeActiveWalletTransactions] Iniciando...')

      try {
        const state = get()
        const { activeWalletId } = state

        if (!activeWalletId) {
          console.log('⚠️ [initializeActiveWalletTransactions] Nenhum wallet ativo')
          return
        }

        console.log(
          `🔍 [initializeActiveWalletTransactions] Verificando cache para wallet ${activeWalletId}`,
        )
        // Verificar se já existe cache para esta carteira
        const { walletCaches } = state.tx
        const existingCache = walletCaches.find(c => c.walletId === activeWalletId)

        if (existingCache) {
          const cacheAge = Date.now() - existingCache.lastUpdated
          const fiveMinutes = 5 * 60 * 1000 // 5 minutos em ms

          if (cacheAge < fiveMinutes) {
            console.log(
              `✅ [initializeActiveWalletTransactions] Cache recente (${Math.round(cacheAge / 1000)}s), pulando`,
            )
            return
          }
          console.log(
            `🔄 [initializeActiveWalletTransactions] Cache antigo (${Math.round(cacheAge / 60000)}min), atualizando`,
          )
        }

        console.log(
          `📡 [initializeActiveWalletTransactions] Buscando transações para ${activeWalletId}`,
        )
        const { fetchTransactions } = state.tx
        await fetchTransactions(activeWalletId)
        console.log('✅ [initializeActiveWalletTransactions] Transações atualizadas com sucesso')
      } catch (error) {
        console.error('❌ [initializeActiveWalletTransactions] Erro durante inicialização:', error)
        throw error // Re-throw para que o hook possa capturar
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

    addPendingTransaction: (tx: Omit<PendingTransaction, 'timestamp'>) => {
      set(state => ({
        tx: {
          ...state.tx,
          pendingTransactions: [...state.tx.pendingTransactions, { ...tx, timestamp: Date.now() }],
        },
      }))
    },

    removePendingTransaction: (txid: string) => {
      set(state => ({
        tx: {
          ...state.tx,
          pendingTransactions: state.tx.pendingTransactions.filter(tx => tx.txid !== txid),
        },
      }))
    },

    getPendingTransactions: (walletId: string) => {
      const { pendingTransactions } = get().tx
      return pendingTransactions.filter(tx => tx.walletId === walletId)
    },
  }

  // Verificar se todas as funções foram criadas corretamente
  const requiredFunctions = [
    'fetchTransactions',
    'getBalance',
    'getUtxos',
    'getTransactionAnalysis',
    'initializeActiveWalletTransactions',
  ]
  for (const funcName of requiredFunctions) {
    const func = (txStore as any)[funcName]
    if (typeof func !== 'function') {
      console.error(`❌ [createTxStorage] Função ${funcName} não foi criada corretamente!`)
    } else {
      console.log(`✅ [createTxStorage] Função ${funcName} criada com sucesso`)
    }
  }

  return { tx: txStore }
}

export default createTxStorage
