import { useStore } from './StoreProvider'
import { createWallet as createWalletLib, CreateWalletParams } from '@/lib/wallet'
import { useTransactions } from './useTransactions'

// Wallet hook
export const useWallet = () => {
  const { state, dispatch } = useStore()
  const { getAddressCache } = useTransactions()

  return {
    // State
    wallets: state.wallet.wallets,
    activeWalletId: state.wallet.activeWalletId,
    unit: state.wallet.unit,
    loadingWalletState: state.wallet.loadingWalletState,

    // Computed
    activeWallet: state.wallet.wallets.find(
      wallet => wallet.walletId === state.wallet.activeWalletId,
    ),

    // Actions
    createWallet: (params: CreateWalletParams) => {
      const newWallet = createWalletLib(params)
      dispatch({ type: 'WALLET', action: { type: 'CREATE_WALLET', payload: newWallet } })
      // Set as active wallet
      dispatch({
        type: 'WALLET',
        action: { type: 'SET_ACTIVE_WALLET', payload: newWallet.walletId },
      })
    },
    editWallet: (walletId: string, updates: any) =>
      dispatch({
        type: 'WALLET',
        action: { type: 'EDIT_WALLET', payload: { walletId, updates } },
      }),
    deleteWallet: (walletId: string) =>
      dispatch({ type: 'WALLET', action: { type: 'DELETE_WALLET', payload: walletId } }),
    clearWallets: () => dispatch({ type: 'WALLET', action: { type: 'CLEAR_WALLETS' } }),
    setActiveWallet: (walletId: string) =>
      dispatch({ type: 'WALLET', action: { type: 'SET_ACTIVE_WALLET', payload: walletId } }),
    setUnit: (unit: 'BTC' | 'Sats') =>
      dispatch({ type: 'WALLET', action: { type: 'SET_UNIT', payload: unit } }),
    setLoadingWallet: (loading: boolean) =>
      dispatch({ type: 'WALLET', action: { type: 'SET_LOADING_WALLET', payload: loading } }),

    // Selectors
    getAddressCache,
  }
}
