import { useStorage } from '../StorageProvider'
import {
  createWallet as createWalletLib,
  CreateWalletParams,
  storeWalletSeed,
  getWalletSeed,
} from '@/lib/wallet'
import { useTransactions } from '../transactions/useTransactions'

// Wallet hook
export const useWallet = () => {
  const { state, dispatch } = useStorage()
  const { getAddressCache } = useTransactions()

  // Get the mnemonic for the active wallet
  const getActiveWalletMnemonic = async (): Promise<string | null> => {
    const activeWalletId = state.wallet?.activeWalletId
    if (!activeWalletId) {
      console.warn('No active wallet found')
      return null
    }

    try {
      const mnemonic = await getWalletSeed(activeWalletId, '')
      if (mnemonic) {
        return mnemonic
      }

      console.error(
        'Wallet seed not found or password required. Please implement wallet unlocking system.',
      )
      return null
    } catch (error) {
      console.error('Error retrieving wallet mnemonic:', error)
      return null
    }
  }

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

    // Helper
    getActiveWalletMnemonic,

    // Actions
    createWallet: async (params: CreateWalletParams, password?: string) => {
      const result = createWalletLib(params)
      const { wallet, seedPhrase } = result

      // Store the seed phrase securely if password is provided
      if (!password) {
        console.warn('No password provided. Wallet seed will not be stored securely.')
      }

      await storeWalletSeed(wallet.walletId, seedPhrase, '')

      dispatch({ type: 'WALLET', action: { type: 'CREATE_WALLET', payload: wallet } })

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
