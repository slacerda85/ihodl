import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { getTxHistory, calculateBalance } from '@/lib/transactions'
import { TxHistory } from '@/models/transaction'
import { StateCreator } from 'zustand'
import { StoreState } from './useStore'

const MAX_BLOCK_INTERVAL = 1000 * 60 * 1

type TransactionsState = {
  transactions: TxState[]
  loading: boolean
}

type TxState = {
  walletId: string
  balance: number
  txHistory: TxHistory[]
  lastUpdated: number
}

type TransactionsActions = {
  getTxStateAsync: () => Promise<void>
  getTransactions: () => TxHistory[] | undefined
  getBalance: () => number | undefined
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
  getTxStateAsync: async () => {
    set({ loading: true })
    // check if lastupdated is less than max block interval
    const existingTx = get().transactions.find(tx => tx.walletId === get().selectedWalletId)
    if (existingTx) {
      const { lastUpdated } = existingTx
      const now = Date.now()
      if (now - lastUpdated < MAX_BLOCK_INTERVAL) {
        set({ loading: false })
        return
      }
    }

    const selectedWalletId = get().selectedWalletId
    if (!selectedWalletId) return
    const wallet = get().getWallet(selectedWalletId)
    if (!wallet) return
    const { seedPhrase, accounts } = wallet
    const account = accounts[0]

    if (!account) return

    const { purpose, coinType, accountIndex } = account
    const entropy = fromMnemonic(seedPhrase)
    const extendedKey = createRootExtendedKey(entropy)

    const { txHistory, balance } = await getTxHistory({
      extendedKey,
      purpose,
      coinType,
      accountIndex,
    })

    set(state => {
      const existingTx = state.transactions.find(tx => tx.walletId === selectedWalletId)
      if (existingTx) {
        return {
          transactions: state.transactions.map(tx =>
            tx.walletId === selectedWalletId
              ? { ...tx, txHistory, balance, lastUpdated: Date.now() }
              : tx,
          ),
        }
      } else {
        return {
          transactions: [
            ...state.transactions,
            { walletId: selectedWalletId, txHistory, balance, lastUpdated: Date.now() },
          ],
        }
      }
    })
    set({ loading: false })
  },
  getTransactions: () => {
    const txState = get().transactions.find(tx => tx.walletId === get().selectedWalletId)
    if (!txState) return undefined
    const { txHistory } = txState
    return txHistory
  },
  getBalance: () => {
    const txState = get().transactions.find(tx => tx.walletId === get().selectedWalletId)
    if (!txState) return undefined
    const { txHistory } = txState
    const { balance } = calculateBalance(txHistory)
    return balance
  },
})

export default createTxSlice
