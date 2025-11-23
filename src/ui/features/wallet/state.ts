import { WalletData } from '@/lib/wallet/types'

// Base types for reducer pattern
type Reducer<S, A> = (state: S, action: A) => S

// Wallet State
export type WalletState = {
  wallets: WalletData[]
  activeWalletId: string | undefined
  unit: 'BTC' | 'Sats'
  loading: boolean
}

// Wallet Actions
export type WalletAction =
  | { type: 'CREATE_WALLET'; payload: WalletData }
  | { type: 'EDIT_WALLET'; payload: { walletId: string; updates: Partial<WalletData> } }
  | { type: 'DELETE_WALLET'; payload: string }
  | { type: 'CLEAR_WALLETS' }
  | { type: 'SET_ACTIVE_WALLET'; payload: string }
  | { type: 'SET_UNIT'; payload: 'BTC' | 'Sats' }
  | { type: 'SET_LOADING_WALLET'; payload: boolean }

// Initial state
export const initialWalletState: WalletState = {
  wallets: [],
  activeWalletId: undefined,
  unit: 'BTC',
  loading: false,
}

// Reducer
export const walletReducer: Reducer<WalletState, WalletAction> = (state, action) => {
  switch (action.type) {
    case 'CREATE_WALLET':
      return {
        ...state,
        wallets: [...state.wallets, action.payload],
      }

    case 'EDIT_WALLET':
      return {
        ...state,
        wallets: state.wallets.map(wallet =>
          wallet.walletId === action.payload.walletId
            ? { ...wallet, ...action.payload.updates }
            : wallet,
        ),
      }

    case 'DELETE_WALLET':
      return {
        ...state,
        wallets: state.wallets.filter(wallet => wallet.walletId !== action.payload),
        activeWalletId: state.activeWalletId === action.payload ? undefined : state.activeWalletId,
      }

    case 'CLEAR_WALLETS':
      return {
        ...state,
        wallets: [],
        activeWalletId: undefined,
      }

    case 'SET_ACTIVE_WALLET':
      return {
        ...state,
        activeWalletId: action.payload,
      }

    case 'SET_UNIT':
      return {
        ...state,
        unit: action.payload,
      }

    case 'SET_LOADING_WALLET':
      return {
        ...state,
        loading: action.payload,
      }

    default:
      return state
  }
}

// Action creators
export const walletActions = {
  createWallet: (wallet: WalletData): WalletAction => ({
    type: 'CREATE_WALLET',
    payload: wallet,
  }),

  editWallet: (walletId: string, updates: Partial<WalletData>): WalletAction => ({
    type: 'EDIT_WALLET',
    payload: { walletId, updates },
  }),

  deleteWallet: (walletId: string): WalletAction => ({
    type: 'DELETE_WALLET',
    payload: walletId,
  }),

  clearWallets: (): WalletAction => ({
    type: 'CLEAR_WALLETS',
  }),

  setActiveWallet: (walletId: string): WalletAction => ({
    type: 'SET_ACTIVE_WALLET',
    payload: walletId,
  }),

  setUnit: (unit: 'BTC' | 'Sats'): WalletAction => ({
    type: 'SET_UNIT',
    payload: unit,
  }),

  setLoadingWallet: (loading: boolean): WalletAction => ({
    type: 'SET_LOADING_WALLET',
    payload: loading,
  }),
}

// Selectors
export const walletSelectors = {
  getActiveWallet: (state: WalletState) =>
    state.wallets.find(wallet => wallet.walletId === state.activeWalletId),
}
