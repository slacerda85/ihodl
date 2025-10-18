import { walletReducer, initialWalletState, WalletState, WalletAction } from './wallet'
import { settingsReducer, initialSettingsState, SettingsState, SettingsAction } from './settings'
import {
  transactionsReducer,
  initialTransactionsState,
  TransactionsState,
  TransactionsAction,
} from './transactions'
import {
  blockchainReducer,
  initialBlockchainState,
  BlockchainState,
  BlockchainAction,
} from './blockchain'

// Combined State
export type AppState = {
  wallet: WalletState
  settings: SettingsState
  transactions: TransactionsState
  blockchain: BlockchainState
}

// Combined Actions
export type AppAction =
  | { type: 'WALLET'; action: WalletAction }
  | { type: 'SETTINGS'; action: SettingsAction }
  | { type: 'TRANSACTIONS'; action: TransactionsAction }
  | { type: 'BLOCKCHAIN'; action: BlockchainAction }

// Initial state
export const initialAppState: AppState = {
  wallet: initialWalletState,
  settings: initialSettingsState,
  transactions: initialTransactionsState,
  blockchain: initialBlockchainState,
}

// Root reducer
export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'WALLET':
      return {
        ...state,
        wallet: walletReducer(state.wallet, action.action),
      }
    case 'SETTINGS':
      return {
        ...state,
        settings: settingsReducer(state.settings, action.action),
      }
    case 'TRANSACTIONS':
      return {
        ...state,
        transactions: transactionsReducer(state.transactions, action.action),
      }
    case 'BLOCKCHAIN':
      return {
        ...state,
        blockchain: blockchainReducer(state.blockchain, action.action),
      }
    default:
      return state
  }
}
