import { createContext, ReactNode, useContext, useState } from 'react'
import { Wallet } from '@/core/models/wallet'
import WalletService from '@/core/services/wallet'

type WalletContextType = {
  activeWalletId: string | undefined
  wallets: Wallet[]
  createWallet: typeof WalletService.prototype.createWallet
  unlinkWallet: typeof WalletService.prototype.deleteWallet
  toggleActiveWallet: typeof WalletService.prototype.toggleActiveWallet
  getMasterKey: typeof WalletService.prototype.getMasterKey
}

const WalletContext = createContext<WalletContextType | null>(null)

interface WalletProviderProps {
  children: ReactNode
}

export default function WalletProvider({ children }: WalletProviderProps) {
  const walletService = new WalletService()
  const {
    getAllWallets,
    createWallet: create,
    deleteWallet: unlink,
    toggleActiveWallet: toggleActive,
    getActiveWalletId,
  } = walletService

  const [wallets, setWallets] = useState<Wallet[]>(getAllWallets)
  const [activeWalletId, setActiveWalletId] = useState<string | undefined>(getActiveWalletId)

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
        getMasterKey: walletService.getMasterKey.bind(walletService),
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
