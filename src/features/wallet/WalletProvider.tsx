import { Wallet } from '@/core/models/wallet'
import { WalletService } from '@/core/services/wallet'
import { createContext, ReactNode, useContext, useState } from 'react'

type WalletContextType = {
  // state
  activeWalletId: string | undefined
  loading: boolean
  wallets: Wallet[]
  // helper functions
  createWallet: (params: Omit<Wallet, 'id'> & { password?: string }) => void
  importWallet: (params: Omit<Wallet, 'id'> & { seed: string; password?: string }) => void
  unlinkWallet: (walletId: string) => void
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

  function createWallet(params: Omit<Wallet, 'id'> & { password?: string }) {
    setLoading(true)
    const { name, accounts, cold, password } = params
    const walletService = new WalletService()
    const newWallet = walletService.createWallet({
      name,
      accounts,
      cold,
      password,
    })
    setWallets(prevWallets => [...prevWallets, newWallet])
    setActiveWalletId(newWallet.id)
    setLoading(false)
  }

  function importWallet(params: Omit<Wallet, 'id'> & { seed: string; password?: string }) {
    setLoading(true)
    const { name, accounts, cold, seed, password } = params
    const walletService = new WalletService()
    const newWallet = walletService.createWallet({
      name,
      accounts,
      cold,
      seed,
      password,
    })
    setWallets(prev => [...prev, newWallet])
    setActiveWalletId(newWallet.id)
    setLoading(false)
  }

  function unlinkWallet(walletId: string) {
    setLoading(true)
    const walletService = new WalletService()
    walletService.deleteWallet(walletId)
    const updatedWallets = walletService.getAllWallets()
    setWallets(updatedWallets)
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
        unlinkWallet,
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
