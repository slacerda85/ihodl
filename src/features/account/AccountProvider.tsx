import { WalletAccount } from '@/core/models/account'
import accountService from '@/core/services/account'
import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { useWallet } from '../wallet'
import { useNetwork } from '../network/NetworkProvider'

type AccountContextType = {
  accounts: WalletAccount[]
  loading: boolean
}

export const AccountContext = createContext<AccountContextType | null>(null)

const updateInterval = 10 * 60 * 1000 // 10 minutes

interface AccountProviderProps {
  children: ReactNode
}

export function AccountProvider({ children }: AccountProviderProps) {
  const { activeWalletId } = useWallet()
  const { getConnection } = useNetwork()
  const [accounts, setAccounts] = useState<WalletAccount[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [lastUpdated, setLastUpdated] = useState<number>(0)

  useEffect(() => {
    async function getAccounts(walletId: string): Promise<void> {
      setLoading(true)
      const connection = await getConnection()
      const accounts = await accountService.getAccounts(walletId, connection)

      setAccounts(accounts)
      setLoading(false)
    }

    if (activeWalletId && (!lastUpdated || lastUpdated < Date.now() - updateInterval)) {
      getAccounts(activeWalletId)
      setLastUpdated(Date.now())
    }
  }, [activeWalletId, getConnection, lastUpdated])

  return (
    <AccountContext
      value={{
        accounts,
        loading,
      }}
    >
      {children}
    </AccountContext>
  )
}

export function useAccount() {
  const context = useContext(AccountContext)
  if (!context) {
    throw new Error('useAccount must be used within an AccountProvider')
  }
  return context
}
