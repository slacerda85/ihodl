import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { calculateBalance, getTxHistory } from '@/lib/transactions'
import { TxHistory } from '@/models/transaction'
import { StateCreator } from 'zustand'
import { StoreState } from './useStore'
import { Account } from '@/models/account'

const MAX_BLOCK_INTERVAL = 1000 * 60 * 1

type TransactionsState = {
  transactions: TxState[]
}

type TxState = {
  walletId: string
  txHistory: TxHistory[]
  loading: boolean
  lastUpdated: number
}

type TransactionsActions = {
  fetchTxHistory: (walletId: string, seedPhrase: string, account: Account) => Promise<void>
  getTxHistory: (walletId: string) => TxHistory[] | undefined
  setTxHistory: (walletId: string, txHistory: TxHistory[]) => void
  // getUTXOs: (walletId: string) => UTXO[] | undefined
  getBalance: (walletId: string) => number
  getLoading: (walletId: string) => boolean
  setLoading: (walletId: string, loading: boolean) => void
}

export type TransactionsSlice = TransactionsState & TransactionsActions

const createTxSlice: StateCreator<
  StoreState,
  [['zustand/persist', unknown]],
  [],
  TransactionsSlice
> = (set, get) => ({
  transactions: [],

  fetchTxHistory: async (walletId: string, seedPhrase: string, account: Account) => {
    // first check lastUpdated time
    const txState = get().transactions.find(tx => tx.walletId === walletId)
    if (txState && Date.now() - txState.lastUpdated < MAX_BLOCK_INTERVAL) {
      return
    }

    get().setLoading(walletId, true)

    // Fetch the data
    const entropy = fromMnemonic(seedPhrase)
    const extendedKey = createRootExtendedKey(entropy)
    const { purpose, coinType, accountIndex } = account

    const { txHistory } = await getTxHistory({
      extendedKey,
      purpose,
      coinType,
      accountStartIndex: accountIndex,
    })

    get().setTxHistory(walletId, txHistory)
  },

  getTxHistory: (walletId: string) => {
    const transaction = get().transactions.find(tx => tx.walletId === walletId)
    return transaction?.txHistory
  },

  setTxHistory: (walletId: string, txHistory: TxHistory[]) => {
    set(state => {
      const transactions = state.transactions.map(tx =>
        tx.walletId === walletId ? { ...tx, txHistory } : tx,
      )
      return { transactions }
    })
  },
  getBalance: (walletId: string) => {
    const txState = get().transactions.find(tx => tx.walletId === walletId)

    const { balance } = calculateBalance(txState?.txHistory || [])

    return balance
  },

  getLoading: (walletId: string) => {
    return get().transactions.some(tx => tx.walletId === walletId && tx.loading)
  },
  setLoading: (walletId: string, loading: boolean) => {
    set(state => {
      const transactions = state.transactions.map(tx =>
        tx.walletId === walletId ? { ...tx, loading } : tx,
      )
      return { transactions }
    })
  },
})

export default createTxSlice
