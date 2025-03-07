import { createContext, ReactNode, useContext, useState } from 'react'
import { createWallet as generateWallet } from './wallet-actions'

type WalletContextType = {
  createWallet: (walletName: string, cold: boolean) => Promise<void>
  wallet:
    | (Awaited<ReturnType<typeof generateWallet>> & { walletName: string; cold: boolean })
    | null
  setWallet: (
    wallet:
      | (Awaited<ReturnType<typeof generateWallet>> & { walletName: string; cold: boolean })
      | null,
  ) => void
}

const WalletContext = createContext({} as WalletContextType)

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<
    | (Awaited<ReturnType<typeof generateWallet>> & {
        walletName: string
        cold: boolean
      })
    | null
  >(null)

  async function createWallet(walletName: string, cold: boolean = false) {
    const newWallet = await generateWallet()
    setWallet({ ...newWallet, walletName, cold })
  }

  return (
    <WalletContext.Provider
      value={{
        createWallet,
        wallet,
        setWallet,
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
