import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { WalletData } from '@/models/wallet'
import store from '@/lib/store'
import { randomUUID } from '@/lib/crypto'

type WalletStore = {
  wallets: WalletData[]
  getSelectedWallet: () => WalletData | undefined
  createWallet: (wallet: WalletData) => void
  deleteWallet: (walletId: string) => void
  clearWallets: () => void
  activeWalletId: string | undefined
  selectWalletId: (walletId: string) => void
  unit: 'BTC' | 'sats'
  setUnit: (unit: 'BTC' | 'sats') => void
}

const useWallet = create<WalletStore>()(
  persist(
    (set, get) => ({
      wallets: [],
      getSelectedWallet: () => {
        const { activeWalletId, wallets } = get()
        return wallets.find(wallet => wallet.walletId === activeWalletId)
      },
      createWallet: (wallet: Omit<WalletData, 'walletId'>) => {
        const walletId = randomUUID()
        const newWallet: WalletData = {
          ...wallet,
          walletId,
        }
        set(state => ({
          wallets: [...state.wallets, newWallet],
          activeWalletId: newWallet.walletId, // Set the selected wallet ID to the newly created wallet
        }))
      },
      deleteWallet: (walletId: string) => {
        set(state => ({
          wallets: state.wallets.filter(wallet => wallet.walletId !== walletId),
          activeWalletId:
            state.activeWalletId === walletId ? state.wallets[0].walletId : state.activeWalletId,
        }))
      },
      clearWallets: () => {
        set({ wallets: [] })
      },
      activeWalletId: undefined,
      selectWalletId: (walletId: string) => {
        set({ activeWalletId: walletId })
      },
      unit: 'BTC',
      setUnit: (unit: 'BTC' | 'sats') => {
        set({ unit })
      },
    }),
    {
      name: 'wallet-storage', // unique name
      storage: createJSONStorage(() => store), // use MMKV storage
    },
  ),
)

export default useWallet
