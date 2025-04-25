import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import store from '@/lib/store'
import { Tx, TxHistory } from '@/models/transaction'
import { getTxHistory } from '@/lib/transactions'
import { createRootExtendedKey, fromMnemonic } from '@/lib/key'

const REFRESH_INTERVAL = 10 * 60 * 1000 // 10 minutes

type TransactionState = {
  walletId: string
  balance: number
  // useSatoshis: boolean
  utxos: {
    address: string
    tx: Tx[]
  }[]
  txHistory: TxHistory[]
  loading: boolean
  lastUpdated: number
}

type TransactionsStore = {
  transactions: TransactionState[]
  loadingWallets: string[] // ids of wallets currently being loaded
  // Data retrieval methods
  getTransactionState: (walletId: string) => TransactionState | undefined
  getBalance: (walletId: string) => number
  isLoading: (walletId: string) => boolean

  // Data manipulation methods
  saveTransactions: (
    walletId: string,
    balance: number,
    // useSatoshis: boolean,
    utxos: {
      address: string
      tx: Tx[]
    }[],
    txHistory: TxHistory[],
  ) => void
  // setUseSatoshis: (walletId: string, useSatoshis: boolean) => void
  clearTransactions: () => void

  // Data fetching method
  fetchWalletData: (walletId: string, seedPhrase: string, account: any) => Promise<void>
}

const useTransactions = create<TransactionsStore>()(
  persist(
    (set, get) => ({
      transactions: [],
      loadingWallets: [],

      getTransactionState: (walletId: string) => {
        return get().transactions.find(tx => tx.walletId === walletId)
      },

      getBalance: (walletId: string) => {
        const transaction = get().getTransactionState(walletId)
        return transaction?.balance || 0
      },

      isLoading: (walletId: string) => {
        return get().loadingWallets.includes(walletId)
      },

      saveTransactions: (
        walletId: string,
        balance: number,
        // useSatoshis: boolean,
        utxos: {
          address: string
          tx: Tx[]
        }[],
        txHistory: TxHistory[],
      ) => {
        const existingTransaction = get().getTransactionState(walletId)
        if (existingTransaction) {
          set(state => ({
            transactions: state.transactions.map(transaction =>
              transaction.walletId === walletId
                ? {
                    ...transaction,
                    balance,
                    // useSatoshis,
                    // Merge existing UTXOs with new ones by address
                    utxos: mergeUtxos(transaction.utxos, utxos),
                    txHistory,
                    loading: false,
                    lastUpdated: Date.now(),
                  }
                : transaction,
            ),
            loadingWallets: state.loadingWallets.filter(id => id !== walletId),
          }))
        } else {
          set(state => ({
            transactions: [
              ...state.transactions,
              {
                walletId,
                balance,
                // useSatoshis,
                utxos, // Directly use the array format
                txHistory,
                loading: false,
                lastUpdated: Date.now(),
              },
            ],
            loadingWallets: state.loadingWallets.filter(id => id !== walletId),
          }))
        }
      },

      clearTransactions: () => {
        set({ transactions: [], loadingWallets: [] })
      },

      fetchWalletData: async (walletId: string, seedPhrase: string, account: any) => {
        // Skip if already loading
        if (get().isLoading(walletId)) return

        try {
          // Set loading state
          set(state => ({
            loadingWallets: [...state.loadingWallets, walletId],
          }))

          // Should we check if data is stale before fetching?
          /* const txState = get().getTransactionState(walletId)
          const shouldRefetch = !txState || Date.now() - txState.lastUpdated > REFRESH_INTERVAL
          if (!shouldRefetch) {
            set(state => ({
              loadingWallets: state.loadingWallets.filter(id => id !== walletId),
            }))
            return
          } */

          // Fetch the data
          const entropy = fromMnemonic(seedPhrase)
          const extendedKey = createRootExtendedKey(entropy)
          const { purpose, coinType, accountIndex } = account

          const {
            balance,
            utxos = [],
            txHistory = [],
          } = await getTxHistory({
            extendedKey,
            purpose,
            coinType,
            accountStartIndex: accountIndex,
          })

          // Save to store
          get().saveTransactions(walletId, balance, utxos, txHistory)
        } catch (error) {
          console.error('Error fetching wallet data:', error)
          // Remove from loading state on error
          set(state => ({
            loadingWallets: state.loadingWallets.filter(id => id !== walletId),
          }))
        }
      },
    }),
    {
      name: 'transactions-storage',
      storage: createJSONStorage(() => store),
    },
  ),
)

// Helper function to merge UTXOs arrays
function mergeUtxos(
  existingUtxos: {
    address: string
    tx: Tx[]
  }[],
  newUtxos: {
    address: string
    tx: Tx[]
  }[],
): {
  address: string
  tx: Tx[]
}[] {
  // Create a map of addresses to transactions
  const utxoMap = new Map<string, Tx[]>()

  // Add existing UTXOs to the map
  existingUtxos.forEach(utxo => {
    utxoMap.set(utxo.address, [...(utxoMap.get(utxo.address) || []), ...utxo.tx])
  })

  // Add new UTXOs to the map, merging with existing ones
  newUtxos.forEach(utxo => {
    utxoMap.set(utxo.address, [...(utxoMap.get(utxo.address) || []), ...utxo.tx])
  })

  // Convert the map back to an array of address/tx objects
  return Array.from(utxoMap.entries()).map(([address, tx]) => ({
    address,
    tx,
  }))
}

export default useTransactions
