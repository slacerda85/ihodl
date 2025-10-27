import { walletReducer, initialWalletState, WalletState, WalletAction } from './wallet/wallet'
import {
  settingsReducer,
  initialSettingsState,
  SettingsState,
  SettingsAction,
} from './settings/settings'
import {
  transactionsReducer,
  initialTransactionsState,
  TransactionsState,
  TransactionsAction,
} from './transactions/transactions'
import {
  blockchainReducer,
  initialBlockchainState,
  BlockchainState,
  BlockchainAction,
} from './blockchain/blockchain'
import {
  lightningReducer,
  initialLightningState,
  LightningState,
  LightningAction,
} from './lightning/lightning'
import {
  electrumReducer,
  initialElectrumState,
  ElectrumState,
  ElectrumAction,
} from './electrum/electrum'

// Combined State
export type AppState = {
  wallet: WalletState
  settings: SettingsState
  transactions: TransactionsState
  blockchain: BlockchainState
  // lightning: LightningState
  electrum: ElectrumState
}

// Combined Actions
export type AppAction =
  | { type: 'WALLET'; action: WalletAction }
  | { type: 'SETTINGS'; action: SettingsAction }
  | { type: 'TRANSACTIONS'; action: TransactionsAction }
  | { type: 'BLOCKCHAIN'; action: BlockchainAction }
  // | { type: 'LIGHTNING'; action: LightningAction }
  | { type: 'ELECTRUM'; action: ElectrumAction }

// Initial state
export const initialAppState: AppState = {
  wallet: initialWalletState,
  settings: initialSettingsState,
  transactions: initialTransactionsState,
  blockchain: initialBlockchainState,
  // lightning: initialLightningState,
  electrum: initialElectrumState,
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
    /* case 'LIGHTNING':
      return {
        ...state,
        lightning: lightningReducer(state.lightning, action.action),
      } */
    case 'ELECTRUM':
      return {
        ...state,
        electrum: electrumReducer(state.electrum, action.action),
      }
    default:
      return state
  }
}
