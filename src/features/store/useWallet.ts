import { useStore } from './StoreProvider'
import { createWallet as createWalletLib, CreateWalletParams, storeWalletSeed } from '@/lib/wallet'
import { useTransactions } from './useTransactions'
import { useLightning } from './useLightning'

// Wallet hook
export const useWallet = () => {
  const { state, dispatch } = useStore()
  const { getAddressCache } = useTransactions()
  const { initializeLightningWallet } = useLightning()

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
    createWallet: async (params: CreateWalletParams, password?: string) => {
      const result = createWalletLib(params)
      const { wallet, seedPhrase } = result

      // Store the seed phrase securely if password is provided
      if (password) {
        try {
          await storeWalletSeed(wallet.walletId, seedPhrase, password)
        } catch (error) {
          console.error('Failed to store wallet seed securely:', error)
          // Continue anyway - wallet can still be created without secure seed storage
        }
      }

      dispatch({ type: 'WALLET', action: { type: 'CREATE_WALLET', payload: wallet } })

      // Initialize Lightning wallet if it has Lightning accounts
      const hasLightningAccount = wallet.accounts.some(account => account.purpose === 9735)
      if (hasLightningAccount) {
        try {
          await initializeLightningWallet(wallet.walletId, {
            nodeUrl: '',
            type: 'lnd',
            authMethod: 'tls',
            maxFeeLimit: 100000, // 100k sats
            defaultCltvExpiry: 144, // 1 hour
            timeoutSeconds: 30,
          })
        } catch (error) {
          console.warn('Failed to initialize Lightning wallet:', error)
        }
      }

      // Set as active wallet
      dispatch({
        type: 'WALLET',
        action: { type: 'SET_ACTIVE_WALLET', payload: wallet.walletId },
      })

      return wallet
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
