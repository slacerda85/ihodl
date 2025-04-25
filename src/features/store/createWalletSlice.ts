import { randomUUID } from '@/lib/crypto'
import { WalletData } from '@/models/wallet'
import { StateCreator } from 'zustand'
import { StoreState } from './useStore'

export type WalletSlice = {
  wallets: WalletData[]
  getSelectedWallet: () => WalletData | undefined
  createWallet: (wallet: WalletData) => void
  deleteWallet: (walletId: string) => void
  clearWallets: () => void
  selectedWalletId: string | undefined
  selectWalletId: (walletId: string) => void
  unit: 'BTC' | 'sats'
  setUnit: (unit: 'BTC' | 'sats') => void
}

const createWalletSlice: StateCreator<
  StoreState,
  [['zustand/persist', unknown]],
  [],
  WalletSlice
> = (set, get) => ({
  wallets: [],
  getSelectedWallet: () => {
    const { selectedWalletId, wallets } = get()
    return wallets.find(wallet => wallet.walletId === selectedWalletId)
  },
  createWallet: (wallet: Omit<WalletData, 'walletId'>) => {
    const walletId = randomUUID()
    const newWallet: WalletData = {
      ...wallet,
      walletId,
    }
    set(state => ({
      wallets: [...state.wallets, newWallet],
      selectedWalletId: newWallet.walletId, // Set the selected wallet ID to the newly created wallet
    }))
  },
  deleteWallet: (walletId: string) => {
    set(state => ({
      wallets: state.wallets.filter(wallet => wallet.walletId !== walletId),
      selectedWalletId:
        state.selectedWalletId === walletId ? state.wallets[0].walletId : state.selectedWalletId,
    }))
  },
  clearWallets: () => {
    set({ wallets: [] })
  },
  selectedWalletId: undefined,
  selectWalletId: (walletId: string) => {
    set({ selectedWalletId: walletId })
  },
  unit: 'BTC',
  setUnit: (unit: 'BTC' | 'sats') => {
    set({ unit })
  },
})

export default createWalletSlice
