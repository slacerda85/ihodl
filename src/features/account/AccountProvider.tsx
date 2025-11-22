import { WalletAccount } from '@/core/models/account'
import { AccountService } from '@/core/services/account'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useWallet } from '../wallet'
import { useNetwork } from '../network/NetworkProvider'
import { FriendlyTx } from '@/core/models/tx'
import { UTXO } from '@/lib/transactions'

type AccountContextType = {
  accounts: WalletAccount[]
  loading: boolean
  // getAccounts(): Promise<WalletAccount[]>
  getBalance(): { balance: number; utxos: UTXO[] }
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

  const intervalRef = useRef<number | null>(null)

  function getBalance() {
    if (activeWalletId) {
      const accountService = new AccountService()
      const { getBalance } = accountService
      const { balance, utxos } = getBalance(activeWalletId)
      return { balance, utxos }
    } else {
      return { balance: 0, utxos: [] }
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
        setLoading(false)
      } catch (error) {
        // Handle error appropriately, e.g., log or set error state
        console.error('Failed to fetch accounts:', error)
        setLoading(false)
      }
    },
    [getConnection],
  )

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    // If activeWalletId exists, fetch immediately and set up interval
    if (activeWalletId) {
      console.log('AccountProvider: updating accounts')
      fetchAccounts(activeWalletId).then(() => {
        // accounts updated
        console.log('AccountProvider: accounts updated')
      })
      // Set up interval to fetch every 10 minutes
      intervalRef.current = setInterval(() => {
        console.log('AccountProvider: periodic update')
        fetchAccounts(activeWalletId).then(() => {
          console.log('AccountProvider: accounts updated')
        })
      }, updateInterval)
    }
    // Cleanup on unmount or when activeWalletId changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
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
        // getAccounts,
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
