import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import createWalletStorage, { WalletStorage } from './createWalletStorage'
import createTxStorage, { TxStorage } from './createTxStorage'
import createSettingsStorage, { SettingsStorage } from './createSettingsStorage'
import storage from '@/lib/storage'

export type StoreState = WalletStorage & TxStorage & SettingsStorage

const useStorage = create<StoreState>()(
  persist(
    (...a) => ({
      ...createWalletStorage(...a),
      ...createTxStorage(...a),
      ...createSettingsStorage(...a),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => storage),
    },
  ),
)

export default useStorage
