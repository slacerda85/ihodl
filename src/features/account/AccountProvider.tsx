import { WalletAccount } from '@/core/models/account'
import { AccountService } from '@/core/services/account'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useWallet } from '../wallet'
import { useNetwork } from '../network/NetworkProvider'
import { FriendlyTx } from '@/core/models/tx'

type AccountContextType = {
  accounts: WalletAccount[]
  loading: boolean
  getAccounts(): Promise<WalletAccount[]>
  getBalance(): number
  getFriendlyTxs(): FriendlyTx[]
  getFriendlyTx(txid: string): FriendlyTx | null
}

export const AccountContext = createContext<AccountContextType | null>(null)

const updateInterval = 10 * 60 * 1000 // 10 minutes

interface AccountProviderProps {
  children: ReactNode
}

export function AccountProvider({ children }: AccountProviderProps) {
  // hooks
  const { activeWalletId } = useWallet()
  const { getConnection } = useNetwork()

  // state
  const [accounts, setAccounts] = useState<WalletAccount[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [lastUpdated, setLastUpdated] = useState<number>(0)

  function getBalance() {
    if (activeWalletId) {
      const accountService = new AccountService()
      const { getBalance } = accountService
      return getBalance(activeWalletId)
    } else {
      return 0
    }
  }

  function getFriendlyTxs(): FriendlyTx[] {
    if (activeWalletId) {
      const accountService = new AccountService()
      const friendlyTxs = accountService.getFriendlyTxs(activeWalletId!)
      return friendlyTxs
    }
    return []
  }

  function getFriendlyTx(txid: string): FriendlyTx | null {
    if (activeWalletId) {
      const accountService = new AccountService()
      const friendlyTx = accountService.getFriendlyTx(txid)
      return friendlyTx
    }
    return null
  }

  const fetchAccounts = useCallback(
    async (walletId: string) => {
      setLoading(true)
      try {
        const connection = await getConnection()
        const accountService = new AccountService()
        const walletAccounts = await accountService.getAccounts(walletId, connection)
        setAccounts(walletAccounts)
        setLastUpdated(Date.now())
        setLoading(false)
      } catch (error) {
        // Handle error appropriately, e.g., log or set error state
        console.error('Failed to fetch accounts:', error)
        setLoading(false)
      }
    },
    [getConnection],
  )

  const getAccounts = useCallback(async () => {
    if (!activeWalletId) return []
    if (Date.now() - lastUpdated < updateInterval && accounts.length > 0) {
      return accounts
    }
    await fetchAccounts(activeWalletId)
    return accounts
  }, [activeWalletId, lastUpdated, accounts, fetchAccounts])

  useEffect(() => {
    if (activeWalletId) {
      fetchAccounts(activeWalletId)
    }
  }, [activeWalletId, fetchAccounts])

  return (
    <AccountContext
      value={{
        accounts,
        loading,
        getBalance,
        getFriendlyTxs,
        getFriendlyTx,
        getAccounts,
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
