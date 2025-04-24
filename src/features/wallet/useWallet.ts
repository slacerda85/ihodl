import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { WalletData } from '@/models/wallet'
import store from '@/lib/store'
import { randomUUID } from '@/lib/crypto'

type WalletStore = {
  wallets: WalletData[]
  createWallet: (wallet: WalletData) => void
  deleteWallet: (walletId: string) => void
  clearWallets: () => void
  selectedWalletId: string | undefined
  selectWalletId: (walletId: string) => void
  loadWallets: () => void
}

const useWallet = create<WalletStore>()(
  persist(
    (set, get) => ({
      wallets: [],
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
            state.selectedWalletId === walletId
              ? state.wallets[0].walletId
              : state.selectedWalletId,
        }))
      },
      clearWallets: () => {
        set({ wallets: [] })
      },
      selectedWalletId: undefined,
      selectWalletId: (walletId: string) => {
        set({ selectedWalletId: walletId })
      },
      loadWallets: () => {
        const wallets = get().wallets
        if (wallets.length === 0) {
          console.log('No wallets found')
        } else {
          console.log('Loaded wallets:', wallets)
        }
      },
    }),
    {
      name: 'wallet-storage', // unique name
      storage: createJSONStorage(() => store), // use MMKV storage
    },
  ),
)

export default useWallet
