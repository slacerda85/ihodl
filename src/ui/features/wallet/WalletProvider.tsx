import { createContext, ReactNode, useContext, useMemo, useState } from 'react'
import { Wallet } from '@/core/models/wallet'
import { walletService } from '@/core/services'

type WalletContextType = {
  activeWalletId: string | undefined
  wallets: Wallet[]
  createWallet: (params: Parameters<typeof walletService.createWallet>[0]) => Wallet
  unlinkWallet: (walletId: string) => void
  toggleActiveWallet: (walletId: string) => void
  getMasterKey: (walletId: string, password?: string) => Uint8Array
}

const WalletContext = createContext<WalletContextType | null>(null)

interface WalletProviderProps {
  children: ReactNode
}

export default function WalletProvider({ children }: WalletProviderProps) {
  const [wallets, setWallets] = useState<Wallet[]>(() => walletService.getAllWallets())
  const [activeWalletId, setActiveWalletId] = useState<string | undefined>(() =>
    walletService.getActiveWalletId(),
  )

  // Funções estáveis via useMemo para evitar conflitos com React Compiler
  const actions = useMemo(
    () => ({
      createWallet: (params: Parameters<typeof walletService.createWallet>[0]) => {
        const newWallet = walletService.createWallet(params)
        setWallets(walletService.getAllWallets())
        setActiveWalletId(walletService.getActiveWalletId())
        return newWallet
      },
      toggleActiveWallet: (walletId: string) => {
        walletService.toggleActiveWallet(walletId)
        setActiveWalletId(walletService.getActiveWalletId())
      },
      unlinkWallet: (walletId: string) => {
        walletService.deleteWallet(walletId)
        setWallets(walletService.getAllWallets())
        setActiveWalletId(walletService.getActiveWalletId())
      },
      getMasterKey: (walletId: string, password?: string) => {
        return walletService.getMasterKey(walletId, password)
      },
    }),
    [],
  )

  const value = useMemo(
    () => ({
      activeWalletId,
      wallets,
      ...actions,
    }),
    [activeWalletId, wallets, actions],
  )

  return <WalletContext value={value}>{children}</WalletContext>
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}
