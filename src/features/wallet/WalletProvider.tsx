import { createContext, ReactNode, useContext, useState } from 'react'
import { Wallet } from '@/core/models/wallet'
import walletService from '@/core/services/wallet'

type WalletContextType = {
  activeWalletId: string
  wallets: Wallet[]
  createWallet: typeof walletService.createWallet
  unlinkWallet: typeof walletService.deleteWallet
  toggleActiveWallet: typeof walletService.toggleActiveWallet
}

const WalletContext = createContext<WalletContextType | null>(null)

interface WalletProviderProps {
  children: ReactNode
}

export default function WalletProvider({ children }: WalletProviderProps) {
  const {
    getAllWallets,
    createWallet: create,
    deleteWallet: unlink,
    toggleActiveWallet: toggleActive,
    getActiveWalletId,
  } = walletService

  const [wallets, setWallets] = useState<Wallet[]>(getAllWallets)
  const [activeWalletId, setActiveWalletId] = useState<string>(getActiveWalletId)

  function createWallet(...args: Parameters<typeof create>) {
    const newWallet = create(...args)
    setWallets(getAllWallets())
    setActiveWalletId(getActiveWalletId())
    return newWallet
  }

  function toggleActiveWallet(...args: Parameters<typeof toggleActive>) {
    toggleActive(...args)
    setActiveWalletId(getActiveWalletId())
  }

  function unlinkWallet(...args: Parameters<typeof unlink>) {
    unlink(...args)
    setWallets(getAllWallets())
    setActiveWalletId(getActiveWalletId())
  }

  return (
    <WalletContext
      value={{
        activeWalletId,
        wallets,
        toggleActiveWallet,
        createWallet,
        unlinkWallet,
      }}
    >
      {children}
    </WalletContext>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}
