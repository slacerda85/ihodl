import { Tx } from '@/models/transaction'
import { UTXO } from '@/lib/utxo'
import { Reducer } from './types'

// Transactions State
export type TransactionsState = {
  walletCaches: {
    walletId: string
    transactions: Tx[]
    addresses: string[]
    lastUpdated: number
  }[]
  pendingTransactions: {
    txid: string
    walletId: string
    recipientAddress: string
    amount: number
    fee: number
    timestamp: number
    txHex: string
  }[]
  loadingTxState: boolean
  loadingMempoolState: boolean
  mempoolTransactions: Tx[]
}

// Transactions Actions
export type TransactionsAction =
  | { type: 'SET_LOADING_TX'; payload: boolean }
  | { type: 'SET_LOADING_MEMPOOL'; payload: boolean }
  | { type: 'SET_WALLET_CACHE'; payload: { walletId: string; cache: any } }
  | { type: 'CLEAR_WALLET_CACHE'; payload: string }
  | { type: 'ADD_PENDING_TX'; payload: any }
  | { type: 'REMOVE_PENDING_TX'; payload: string }
  | { type: 'SET_MEMPOOL_TRANSACTIONS'; payload: Tx[] }

// Initial state
export const initialTransactionsState: TransactionsState = {
  walletCaches: [],
  pendingTransactions: [],
  loadingTxState: false,
  loadingMempoolState: false,
  mempoolTransactions: [],
}

// Reducer
export const transactionsReducer: Reducer<TransactionsState, TransactionsAction> = (
  state,
  action,
) => {
  switch (action.type) {
    case 'SET_LOADING_TX':
      return {
        ...state,
        loadingTxState: action.payload,
      }

    case 'SET_LOADING_MEMPOOL':
      return {
        ...state,
        loadingMempoolState: action.payload,
      }

    case 'SET_WALLET_CACHE':
      const existingIndex = state.walletCaches.findIndex(
        cache => cache.walletId === action.payload.walletId,
      )
      const newCaches = [...state.walletCaches]

      if (existingIndex >= 0) {
        newCaches[existingIndex] = action.payload.cache
      } else {
        newCaches.push(action.payload.cache)
      }

      return {
        ...state,
        walletCaches: newCaches,
      }

    case 'CLEAR_WALLET_CACHE':
      return {
        ...state,
        walletCaches: state.walletCaches.filter(cache => cache.walletId !== action.payload),
      }

    case 'ADD_PENDING_TX':
      return {
        ...state,
        pendingTransactions: [...state.pendingTransactions, action.payload],
      }

    case 'REMOVE_PENDING_TX':
      return {
        ...state,
        pendingTransactions: state.pendingTransactions.filter(tx => tx.txid !== action.payload),
      }

    case 'SET_MEMPOOL_TRANSACTIONS':
      return {
        ...state,
        mempoolTransactions: action.payload,
      }

    default:
      return state
  }
}

// Action creators
export const transactionsActions = {
  setLoadingTx: (loading: boolean): TransactionsAction => ({
    type: 'SET_LOADING_TX',
    payload: loading,
  }),

  setLoadingMempool: (loading: boolean): TransactionsAction => ({
    type: 'SET_LOADING_MEMPOOL',
    payload: loading,
  }),

  setWalletCache: (walletId: string, cache: any): TransactionsAction => ({
    type: 'SET_WALLET_CACHE',
    payload: { walletId, cache },
  }),

  clearWalletCache: (walletId: string): TransactionsAction => ({
    type: 'CLEAR_WALLET_CACHE',
    payload: walletId,
  }),

  addPendingTransaction: (tx: any): TransactionsAction => ({
    type: 'ADD_PENDING_TX',
    payload: tx,
  }),

  removePendingTransaction: (txid: string): TransactionsAction => ({
    type: 'REMOVE_PENDING_TX',
    payload: txid,
  }),

  setMempoolTransactions: (transactions: Tx[]): TransactionsAction => ({
    type: 'SET_MEMPOOL_TRANSACTIONS',
    payload: transactions,
  }),
}

// Selectors
export const transactionsSelectors = {
  getWalletCache: (state: TransactionsState, walletId: string) =>
    state.walletCaches.find(cache => cache.walletId === walletId) || null,

  getPendingTransactions: (state: TransactionsState, walletId: string) =>
    state.pendingTransactions.filter(tx => tx.walletId === walletId),

  getBalance: (state: TransactionsState, walletId: string) => {
    // Simplified balance calculation
    const cache = state.walletCaches.find(c => c.walletId === walletId)
    if (!cache) return 0
    // This would need the processWalletTransactions logic
    return 0
  },
}
