import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { getTxHistory, calculateBalance } from '@/lib/transactions'
import { TxHistory } from '@/models/transaction'
import { StateCreator } from 'zustand'
import { StoreState } from './useStore'

const MAX_BLOCK_INTERVAL = 1000 * 60 * 1

type TransactionsState = {
  transactions: Transaction[]
  loading: boolean
}

type Transaction = {
  walletId: string
  balance: number
  txHistory: TxHistory[]
  lastUpdated: number
}

type TransactionsActions = {
  setLoading: (loading: boolean) => void
  fetchTransactions: (walletId: string) => Promise<void>
}

export type TransactionsSlice = TransactionsState & TransactionsActions

const createTxSlice: StateCreator<
  StoreState,
  [['zustand/persist', unknown]],
  [],
  TransactionsSlice
> = (set, get) => ({
  transactions: [],
  loading: false,
  setLoading: loading => {
    set({ loading })
  },
  fetchTransactions: async walletId => {
    const { wallets } = get()
    const wallet = wallets.find(w => w.walletId === walletId)
    if (!wallet) return

    const { accounts, seedPhrase } = wallet
    const entropy = fromMnemonic(seedPhrase)
    const extendedKey = createRootExtendedKey(entropy)

    const { purpose, coinType, accountIndex } = accounts[0]

    const { balance, txHistory } = await getTxHistory({
      extendedKey,
      purpose,
      coinType,
      accountIndex,
    })

    set(state => ({
      transactions: [
        ...state.transactions.filter(t => t.walletId !== walletId),
        {
          walletId,
          balance,
          txHistory,
          lastUpdated: Date.now(),
        },
      ],
      loading: false,
    }))
  },
})

export default createTxSlice
