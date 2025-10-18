import { useStore } from './StoreProvider'
import { createWallet as createWalletLib, CreateWalletParams } from '@/lib/wallet'
import { generateWalletAddressesAsync, generateNextUnusedAddressAsync } from '@/lib/address'
import { useCallback } from 'react'
import { useTransactions } from './useTransactions'

// Wallet hook
export const useWallet = () => {
  const { state, dispatch } = useStore()
  const { walletCaches } = useTransactions()

  // Helper function to get transaction storage state
  const getTxStorage = useCallback(
    () => ({
      walletCaches,
      pendingTransactions: [],
      loadingTxState: false,
      loadingMempoolState: false,
    }),
    [walletCaches],
  )

  return {
    // State
    wallets: state.wallet.wallets,
    activeWalletId: state.wallet.activeWalletId,
    unit: state.wallet.unit,
    loadingWalletState: state.wallet.loadingWalletState,
    addressCache: state.wallet.addressCache,

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
    setAddressCache: (walletId: string, cache: any) =>
      dispatch({
        type: 'WALLET',
        action: { type: 'SET_ADDRESS_CACHE', payload: { walletId, cache } },
      }),
    clearAddressCache: (walletId?: string) =>
      dispatch({ type: 'WALLET', action: { type: 'CLEAR_ADDRESS_CACHE', payload: walletId } }),

    // Async address generation functions
    generateWalletAddresses: useCallback(
      async (walletId: string) => {
        const wallet = state.wallet.wallets.find(w => w.walletId === walletId)
        if (!wallet) {
          throw new Error(`Wallet with id ${walletId} not found`)
        }

        try {
          const txStorage = getTxStorage()
          const addressData = await generateWalletAddressesAsync(wallet, txStorage)

          // Update the cache in state
          const cache = {
            nextUnusedAddress: addressData.nextUnusedAddress,
            usedReceivingAddresses: addressData.usedReceivingAddresses,
            usedChangeAddresses: addressData.usedChangeAddresses,
            lastUpdated: Date.now(),
          }

          dispatch({
            type: 'WALLET',
            action: { type: 'SET_ADDRESS_CACHE', payload: { walletId, cache } },
          })

          return addressData
        } catch (error) {
          console.error('Error generating wallet addresses:', error)
          throw error
        }
      },
      [state.wallet.wallets, getTxStorage, dispatch],
    ),

    generateNextUnusedAddress: useCallback(
      async (walletId: string) => {
        const wallet = state.wallet.wallets.find(w => w.walletId === walletId)
        if (!wallet) {
          throw new Error(`Wallet with id ${walletId} not found`)
        }

        try {
          const txStorage = getTxStorage()
          const nextAddress = await generateNextUnusedAddressAsync(wallet, txStorage)

          // Update the cache with the new next unused address
          const existingCache = state.wallet.addressCache[walletId]
          if (existingCache) {
            const updatedCache = {
              ...existingCache,
              nextUnusedAddress: nextAddress,
              lastUpdated: Date.now(),
            }

            dispatch({
              type: 'WALLET',
              action: { type: 'SET_ADDRESS_CACHE', payload: { walletId, cache: updatedCache } },
            })
          }

          return nextAddress
        } catch (error) {
          console.error('Error generating next unused address:', error)
          throw error
        }
      },
      [state.wallet.wallets, state.wallet.addressCache, getTxStorage, dispatch],
    ),

    // Selectors
    getAddressCache: (walletId: string) => state.wallet.addressCache[walletId] || null,
  }
}
