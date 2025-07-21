import { WalletData } from '@/models/wallet'
import { StateCreator } from 'zustand'
import { StoreState } from './useStorage'
import { createWallet, CreateWalletParams } from '@/lib/wallet'

export type WalletState = {
  wallets: WalletData[]
  activeWalletId: string | undefined
  unit: 'BTC' | 'Sats'
  loadingWalletState: boolean
}

type WalletActions = {
  createWallet: (wallet: CreateWalletParams) => void
  editWallet: (wallet: Partial<WalletData>) => void
  deleteWallet: (walletId: string) => void
  clearWallets: () => void
  setActiveWalletId: (walletId: string) => void
  setUnit: (unit: 'BTC' | 'Sats') => void
  setLoadingWalletState: (loading: boolean) => void
}

export type WalletStorage = WalletState & WalletActions

const createWalletStorage: StateCreator<
  StoreState,
  [['zustand/persist', unknown]],
  [],
  WalletStorage
> = (set, get) => ({
  // state
  wallets: [],
  activeWalletId: undefined,
  unit: 'BTC',
  loadingWalletState: false,
  setLoadingWalletState: loading => {
    set(() => ({ loadingWalletState: loading }))
  },
  // actions
  createWallet: ({
    accounts,
    cold,
    walletName = `Wallet ${get().wallets.length + 1}`,
    seedPhrase,
  }) => {
    console.log('➕ [createWallet] Criando nova carteira:', walletName)

    // check if wallet has enough data
    if (!accounts || accounts.length === 0) {
      console.error('❌ [createWallet] Wallet accounts are required')
      return
    }
    const newWallet = createWallet({
      walletName,
      seedPhrase: seedPhrase,
      cold,
      accounts: accounts,
    })

    console.log('✅ [createWallet] Carteira criada com ID:', newWallet.walletId)

    set(state => ({
      wallets: [...state.wallets, newWallet],
      activeWalletId: newWallet.walletId, // Set the selected wallet ID to the newly created wallet
    }))

    // Automaticamente buscar transações da nova carteira
    console.log('🔄 [createWallet] Acionando busca automática de transações para nova carteira...')
    const { tx } = get()
    tx.fetchTransactions(newWallet.walletId).catch(error => {
      console.error('❌ [createWallet] Erro ao buscar transações da nova carteira:', error)
    })
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
    console.log('🎯 [setActiveWalletId] Definindo carteira ativa:', walletId)

    set(() => ({ activeWalletId: walletId }))

    /* // Automaticamente buscar transações da carteira ativa
    if (walletId) {
      console.log('🔄 [setActiveWalletId] Acionando busca automática de transações...')
      const { tx } = get()
      tx.fetchTransactions(walletId).catch(error => {
        console.error('❌ [setActiveWalletId] Erro ao buscar transações automaticamente:', error)
      })
    } */
  },
  setUnit: (unit: 'BTC' | 'Sats') => {
    set(() => ({ unit }))
  },
})

export default createWalletStorage
