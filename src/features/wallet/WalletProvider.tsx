import { Wallet } from '@/core/models/wallet'
import { WalletService } from '@/core/services/wallet'
import { createContext, ReactNode, useContext, useState } from 'react'

type WalletContextType = {
  activeWalletId: string | undefined
  loading: boolean
  wallets: Wallet[]
  // helper functions
  createWallet: (
    params: Pick<Wallet, 'name' | 'accounts' | 'cold'> & { password?: string },
  ) => Promise<void>
  importWallet: (
    params: Pick<Wallet, 'name' | 'accounts' | 'cold'> & { seed: string; password?: string },
  ) => Promise<void>
  toggleActiveWallet: (walletId: string) => void
  toggleLoading: (value: boolean) => void
}

const WalletContext = createContext<WalletContextType | null>(null)

interface WalletProviderProps {
  children: ReactNode
}

export default function WalletProvider({ children }: WalletProviderProps) {
  const [loading, setLoading] = useState<boolean>(false)
  const [wallets, setWallets] = useState<Wallet[]>(getInitialWallets)
  const [activeWalletId, setActiveWalletId] = useState<string>(wallets[0]?.id)

  function getInitialWallets(): Wallet[] {
    const walletService = new WalletService()
    return walletService.getAllWallets()
  }

  async function createWallet(
    params: Pick<Wallet, 'name' | 'accounts' | 'cold'> & { password?: string },
  ) {
    setLoading(true)
    const { name, accounts, cold, password } = params
    const walletService = new WalletService()
    const newWallet = await walletService.createWallet({
      name,
      accounts,
      cold,
      password,
    })
    const updatedWallets = walletService.getAllWallets()
    setWallets(updatedWallets)
    setActiveWalletId(newWallet.id)
    setLoading(false)
  }

  async function importWallet(
    params: Pick<Wallet, 'name' | 'accounts' | 'cold'> & { seed: string; password?: string },
  ) {
    setLoading(true)
    const { name, accounts, cold, seed, password } = params
    const walletService = new WalletService()
    await walletService.createWallet({
      name,
      accounts,
      cold,
      seed,
      password,
    })
    const updatedWallets = walletService.getAllWallets()
    setWallets(updatedWallets)
    setLoading(false)
  }

  function toggleActiveWallet(walletId: string) {
    setActiveWalletId(walletId)
  }

  function toggleLoading(value: boolean) {
    setLoading(value)
  }

  return (
    <WalletContext.Provider
      value={{
        activeWalletId,
        loading,
        wallets,
        toggleActiveWallet,
        toggleLoading,
        createWallet,
        importWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}
