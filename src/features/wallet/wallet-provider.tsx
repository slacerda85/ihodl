import { createContext, ReactNode, useContext, useState } from 'react'
import { createWallet as generateWallet } from './wallet-actions'

type WalletContextType = {
  createWallet: () => Promise<void>
  wallet: Awaited<ReturnType<typeof generateWallet>> | null
  setWallet: (wallet: Awaited<ReturnType<typeof generateWallet>> | null) => void
}

const WalletContext = createContext({} as WalletContextType)

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof generateWallet>> | null>(null)

  async function createWallet() {
    const newWallet = generateWallet()
    setWallet(newWallet)
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
