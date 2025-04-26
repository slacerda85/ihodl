import { WalletData } from '@/models/wallet'
import { StateCreator } from 'zustand'
import { StoreState } from './useStore'
import { createEntropy, randomUUID } from '@/lib/crypto'
import { toMnemonic } from '@/lib/key'
import { CoinType, Purpose } from '@/models/account'

export type WalletState = {
  wallets: WalletData[]
  activeWalletId: string | undefined
  unit: 'BTC' | 'sats'
}

type WalletActions = {
  createWallet: (wallet: Partial<WalletData>) => void
  editWallet: (wallet: Partial<WalletData>) => void
  deleteWallet: (walletId: string) => void
  clearWallets: () => void
  setActiveWalletId: (walletId: string) => void
  setUnit: (unit: 'BTC' | 'sats') => void
}

export type WalletSlice = WalletState & WalletActions

const createWalletSlice: StateCreator<
  StoreState,
  [['zustand/persist', unknown]],
  [],
  WalletSlice
> = (set, get) => ({
  // state
  wallets: [],
  activeWalletId: undefined,
  unit: 'BTC',
  createWallet: wallet => {
    // check if wallet has enough data
    if (!wallet.accounts || wallet.accounts.length === 0) {
      console.error('Wallet accounts are required')
      return
    }
    const walletId = randomUUID()
    const walletName = wallet.walletName ?? `Wallet ${get().wallets.length + 1}`
    const seedPhrase = wallet.seedPhrase ?? toMnemonic(createEntropy(12))
    const cold = wallet.cold ?? false
    const accounts =
      wallet.accounts.length > 0
        ? wallet.accounts
        : [{ purpose: 84 as Purpose, coinType: 0 as CoinType, accountIndex: 0 }]
    const newWallet: WalletData = {
      walletId,
      walletName,
      seedPhrase,
      cold,
      accounts,
    }
    set(state => ({
      wallets: [...state.wallets, newWallet],
      activeWalletId: newWallet.walletId, // Set the selected wallet ID to the newly created wallet
    }))
  },
  // actions
  editWallet: wallet => {
    // check if wallet has enough data
    if (!wallet.walletId) {
      console.error('Wallet ID is required')
      return
    }
    const existingParams = Object.keys(wallet).filter(
      key => wallet[key as keyof WalletData] !== undefined,
    )
    if (existingParams.length === 0) {
      console.error('No wallet data provided')
      return
    }
    // check if wallet already exists
    const wallets = get().wallets
    const walletIndex = wallets.findIndex(w => w.walletId === wallet.walletId)
    if (walletIndex !== -1) {
      const updatedWallets = [...wallets]
      updatedWallets[walletIndex] = {
        ...updatedWallets[walletIndex],
        ...wallet,
      }
      set(() => ({ wallets: updatedWallets }))
    } else {
      console.error('Wallet not found')
    }
  },
  deleteWallet: walletId => {
    set(state => ({
      wallets: state.wallets.filter(wallet => wallet.walletId !== walletId),
    }))
    set(state => ({
      activeWalletId:
        state.activeWalletId === walletId ? state.wallets[0]?.walletId : state.activeWalletId,
    }))
  },
  clearWallets: () => {
    set(() => ({ wallets: [] }))
  },
  setActiveWalletId: walletId => {
    set(() => ({ activeWalletId: walletId }))
  },
  setUnit: (unit: 'BTC' | 'sats') => {
    set(() => ({ unit }))
  },
})

export default createWalletSlice
