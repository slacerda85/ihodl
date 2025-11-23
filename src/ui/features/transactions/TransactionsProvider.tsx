import { Account, AccountDetails } from '@/core/models/account'
import { createContext, ReactNode, useState } from 'react'
import { useWallet } from '../wallet'
import { AccountService } from '@/core/services/account'

type TransactionsContextType = {
  history: (AccountDetails & { walletId: string })[]
}

export const TransactionsContext = createContext<TransactionsContextType | null>(null)

type TransactionsProviderProps = {
  children: ReactNode
}

export default function TransactionsProvider({ children }: TransactionsProviderProps) {
  const { activeWalletId, wallets } = useWallet()
  const wallet = wallets.find(w => w.id === activeWalletId)
  const accounts = wallet?.accounts || []
  const accountService = new AccountService()

  const discoverAccounts = async (accounts: Account[], walletId: string) => {
    const allDetails: (AccountDetails & { walletId: string })[] = []
    for (const account of accounts) {
      const details = await accountService.discover({ ...account, walletId })
      const detailsWithWalletId = details.map(d => ({ ...d, walletId }))
      allDetails.push(...detailsWithWalletId)
    }
    return allDetails
  }

  const [history, setHistory] = useState<(AccountDetails & { walletId: string })[]>(() => {
    if (wallet && accounts.length > 0) {
      let details: (AccountDetails & { walletId: string })[] = []
      discoverAccounts(accounts, wallet.id)
        .then(resolvedDetails => {
          details = resolvedDetails
          setHistory(details)
        })
        .catch(console.error)
      return details
    }
    return []
  })

  return (
    <TransactionsContext.Provider
      value={{
        history,
      }}
    >
      {children}
    </TransactionsContext.Provider>
  )
}

/* import { createContext, useContext, useReducer, ReactNode, useEffect } from 'react'
import { transactionsReducer, initialTransactionsState, TransactionsState, actions } from './state'
import { MMKV } from 'react-native-mmkv'
import { useElectrum } from '../electrum/ElectrumProvider'
import { useWallet } from '../wallet/WalletProvider'
import {
  getFriendlyTransactions,
  deriveExtendedKeys,
  getTxHistoryFromAddresses,
  TxHistory,
} from '@/lib/transactions'
import { getWalletSeedPhrase } from '@/lib/secureStorage'
import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { generateAddresses as generateAddressesLib } from '@/lib/address'

const storage = new MMKV()
const TRANSACTIONS_STORAGE_KEY = 'transactions-state'

// Load initial state from storage
const loadPersistedTransactionsState = (): TransactionsState => {
  try {
    const persistedState = storage.getString(TRANSACTIONS_STORAGE_KEY)
    if (persistedState) {
      const parsed = JSON.parse(persistedState)
      // Merge with initial state to handle new properties
      return {
        ...initialTransactionsState,
        ...parsed,
        // Reset loading states on app start
        loading: false,
      }
    }
  } catch (error) {
    console.error('Error loading persisted transactions state:', error)
  }
  return initialTransactionsState
}

// Context
type TransactionsContextType = TransactionsState

const TransactionsContext = createContext<TransactionsContextType | undefined>(undefined)

// Provider
export default function TransactionsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(transactionsReducer, loadPersistedTransactionsState())
  const { getConnection } = useElectrum()
  const { activeWalletId } = useWallet()

  // calculate and store addresses
  useEffect(() => {
    const generateAddresses = async (activeWalletId: string) => {
      const seedPhrase = await getWalletSeedPhrase(activeWalletId)
      if (!seedPhrase) return
      const extendedKey = createRootExtendedKey(fromMnemonic(seedPhrase))
      const { changeExtendedKey, receivingExtendedKey } = deriveExtendedKeys(extendedKey)

      // bip 44 account discovery loop
      let startIndex = 0
      const batchSize = 20
      let allTxHistory: TxHistory[] = []
      let hasUnused = true

      while (hasUnused) {
        const addresses = generateAddressesLib(
          receivingExtendedKey,
          changeExtendedKey,
          startIndex,
          batchSize,
        )
        const receivingAddresses = addresses.filter(a => a.type === 'receiving').map(a => a.address)
        const changeAddresses = addresses.filter(a => a.type === 'change').map(a => a.address)

        const { txHistory, hasUnusedAddresses } = await getTxHistoryFromAddresses(
          receivingAddresses,
          changeAddresses,
          getConnection(),
          batchSize,
        )

        allTxHistory.push(...txHistory)
        hasUnused = hasUnusedAddresses
        startIndex += batchSize
      }

      const friendly = await getFriendlyTransactions(allTxHistory, activeWalletId)

      dispatch(
        actions.setHistory({
          walletId: activeWalletId,
          txs: allTxHistory,
          lastUpdated: Date.now(),
        }),
      )

      dispatch(
        actions.setFriendly({
          walletId: activeWalletId,
          friendlyTxs: friendly,
          lastUpdated: Date.now(),
        }),
      )
    }

    // only calculate if we don't have addresses for the active wallet
    if (
      activeWalletId &&
      !state.loading &&
      !state.history.find(h => h.walletId === activeWalletId) &&
      !state.friendly.find(f => f.walletId === activeWalletId)
    ) {
      generateAddresses(activeWalletId)
        .then(() => {
          // nothing
        })
        .catch(console.error)
    }
  }, [activeWalletId, dispatch, state.history, getConnection, state.loading, state.friendly])

  return (
    <TransactionsContext.Provider
      value={{
        ...state,
      }}
    >
      {children}
    </TransactionsContext.Provider>
  )
}

export const useTransactions = (): TransactionsContextType => {
  const context = useContext(TransactionsContext)
  if (!context) {
    throw new Error('useTransactions must be used within a TransactionsProvider')
  }
  return context
}
 */
