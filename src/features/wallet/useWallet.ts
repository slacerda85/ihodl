import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { WalletData } from '@/models/wallet'
import store from '@/lib/store'
import { deleteWallet } from '@/lib/wallet'

type WalletStore = {
  wallets: WalletData[]
  createWallet: (wallet: WalletData) => void
  deleteWallet: (walletId: string) => void
  clearWallets: () => void
  selectedWalletId: string | undefined
  selectWalletId: (walletId: string) => void
}

const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      wallets: [],
      createWallet: (wallet: WalletData) => {
        set(state => ({ wallets: [...state.wallets, wallet] }))
      },
      deleteWallet: async (walletId: string) => {
        await deleteWallet(walletId)
        set(state => ({
          wallets: state.wallets.filter(wallet => wallet.walletId !== walletId),
        }))
      },
      clearWallets: () => {
        set({ wallets: [] })
      },
      selectedWalletId: undefined,
      selectWalletId: (walletId: string) => {
        set({ selectedWalletId: walletId })
      },
    }),
    {
      name: 'wallet-storage',
      storage: createJSONStorage(() => store),
    },
  ),
)

export default useWalletStore
