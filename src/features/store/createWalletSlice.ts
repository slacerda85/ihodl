import { randomUUID } from '@/lib/crypto'
import { WalletData } from '@/models/wallet'
import { StateCreator } from 'zustand'
import { StoreState } from './useStore'

export type WalletSlice = {
  wallets: WalletData[]
  getWallet(walletId: string): WalletData | undefined
  setWallet(walletId: string, wallet: Partial<WalletData>): void
  createWallet: (wallet: WalletData) => void
  deleteWallet: (walletId: string) => void
  clearWallets: () => void
  getSelectedWallet: () => WalletData | undefined
  selectedWalletId: string | undefined
  setSelectedWalletId: (walletId: string) => void
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
  getWallet: (walletId: string) => {
    const { wallets } = get()
    return wallets.find(wallet => wallet.walletId === walletId)
  },
  setWallet: (walletId: string, wallet: Partial<WalletData>) => {
    const { wallets } = get()
    const walletIndex = wallets.findIndex(w => w.walletId === walletId)
    if (walletIndex !== -1) {
      const updatedWallets = [...wallets]
      updatedWallets[walletIndex] = {
        ...updatedWallets[walletIndex],
        ...wallet,
      }
      set({ wallets: updatedWallets })
    }
  },
  getSelectedWallet: () => {
    const { selectedWalletId, getWallet } = get()
    if (!selectedWalletId) return undefined
    const selectedWallet = getWallet(selectedWalletId)
    return selectedWallet
  },
  createWallet: (wallet: Omit<WalletData, 'walletId'>) => {
    const walletId = randomUUID()
    const newWallet: WalletData = {
      ...wallet,
      walletId,
    }
    set(state => ({
      wallets: [...state.wallets, newWallet],
    }))
    set({ selectedWalletId: walletId })
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
  setSelectedWalletId: (walletId: string) => {
    set({ selectedWalletId: walletId })
  },
  unit: 'BTC',
  setUnit: (unit: 'BTC' | 'sats') => {
    set({ unit })
  },
})

export default createWalletSlice
