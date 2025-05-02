import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import createWalletSlice, { WalletSlice } from './createWalletSlice'
import createTxSlice, { TransactionsSlice } from './createTxSlice'
import storage from '@/lib/storage'

export type StoreState = WalletSlice & TransactionsSlice

const useStorage = create<StoreState>()(
  persist(
    (...a) => ({
      ...createWalletSlice(...a),
      ...createTxSlice(...a),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => storage),
    },
  ),
)

export default useStorage
