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
      // Versão para forçar recreação quando há mudanças estruturais
      version: 2, // Incrementando versão para forçar recriação
      migrate: (persistedState: any, version: number) => {
        console.log('🔄 [Storage] Migrando storage da versão', version)
        // Se for versão antiga, força recriação completa
        if (version < 2) {
          console.log('🗑️ [Storage] Versão antiga detectada, recriando storage...')
          return {} // Estado vazio, será recriado
        }
        return persistedState
      },
      // Persistir apenas dados, não funções (o Zustand recria as funções automaticamente)
      partialize: state => {
        console.log('💾 [Storage] Salvando estado:', {
          walletsCount: state.wallets?.length || 0,
          activeWalletId: state.activeWalletId,
          txCachesCount: state.tx?.walletCaches?.length || 0,
        })

        return {
          // Estados das wallets
          wallets: state.wallets,
          activeWalletId: state.activeWalletId,
          unit: state.unit,
          loadingWalletState: false, // Sempre resetar loading states
          // Estados das configurações
          colorMode: state.colorMode,
          userOverride: state.userOverride,
          // Para TX, persistir apenas os dados, não os estados de loading
          // REMOVER: tx: { walletCaches: state.tx?.walletCaches || [], loadingTxState: false }
          // As funções serão recriadas automaticamente pelo Zustand
        }
      },
    },
  ),
)

export default useStorage
