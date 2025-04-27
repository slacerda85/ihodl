import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { getTxHistory } from '@/lib/transactions'
import { TxHistory } from '@/models/transaction'
import { StateCreator } from 'zustand'
import { StoreState } from './useStore'

const FETCH_INTERVAL = 1000 * 60 * 1

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
    set(() => ({ loading }))
  },
  fetchTransactions: async walletId => {
    set(() => ({ loading: true }))
    try {
      // check if last fetch was less then 10 minutes from lastUpdated, using fetch interval
      const transactions = get().transactions
      const transaction = transactions.find(t => t.walletId === walletId)
      if (transaction !== undefined && Date.now() - transaction.lastUpdated < FETCH_INTERVAL) {
        return
      }

      const wallets = get().wallets
      const wallet = wallets.find(w => w.walletId === walletId)
      if (!wallet) return

      const { accounts, seedPhrase } = wallet
      const entropy = fromMnemonic(seedPhrase)
      const extendedKey = createRootExtendedKey(entropy)
      const { purpose, coinType, accountIndex } = accounts[0] // todo: support multiple accounts
      const { balance, txHistory } = await getTxHistory({
        extendedKey,
        purpose,
        coinType,
        accountStartIndex: accountIndex,
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
      }))
    } catch (error) {
      console.error('Error fetching transactions:', error)
    } finally {
      set(() => ({ loading: false }))
    }
  },
})

export default createTxSlice
