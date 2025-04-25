import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import createWalletSlice, { WalletSlice } from './createWalletSlice'
import createTxSlice, { TransactionsSlice } from './createTxSlice'
import store from '@/lib/store'

export type StoreState = WalletSlice & TransactionsSlice

const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createWalletSlice(...a),
      ...createTxSlice(...a),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => store),
    },
  ),
)

export default useStore
