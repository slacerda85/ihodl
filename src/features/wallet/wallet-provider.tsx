import { createContext, ReactNode } from 'react'

const WalletContext = createContext({})

export default function WalletProvider({ children }: { children: ReactNode }) {
  const createWallet = () => {}

  return (
    <WalletContext.Provider
      value={{
        createWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  return WalletContext
}
