import { createContext, ReactNode, useContext, useMemo, useState } from 'react'
import { getWallets, getSelectedWalletId } from '@/lib/wallet'
import { WalletData } from '@/models/wallet'
import useCache from '@/features/cache'
import { KeyedMutator } from 'swr'
import { getTxHistory } from '@/lib/transactions'
import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
// import { KeyedMutator } from 'swr'

type WalletContextType = {
  // wallet data
  wallets: WalletData[] | undefined
  loadingWallets: boolean
  revalidateWallets: KeyedMutator<WalletData[]>
  // selected wallet data
  selectedWalletId: string | undefined
  loadingSelectedWalletId: boolean
  revalidateSelectedWalletId: KeyedMutator<string | undefined>
  // balance data
  balance: string
  loadingBalance: boolean
  revalidateBalance: KeyedMutator<{
    balance: number
    utxos: {
      address: string
      tx: any[] // Replace with the correct type for transactions
    }[]
  }>
  // other data
  selectedWallet: WalletData | undefined
  useSatoshis: boolean
  toggleUnit: () => void
  // revalidate: () => Promise<void>
}

const WalletContext = createContext({} as WalletContextType)

export default function WalletProvider({ children }: { children: ReactNode }) {
  const defaultCacheParams = {
    // 10 minutes
    refreshInterval: 5 * 60 * 1000,
  }

  const {
    data: wallets,
    isLoading: loadingWallets,
    mutate: revalidateWallets,
  } = useCache('wallets', getWallets)

  const {
    data: selectedWalletId,
    isLoading: loadingSelectedWalletId,
    mutate: revalidateSelectedWalletId,
  } = useCache('selectedWalletId', getSelectedWalletId)

  const { data: selectedWallet } = useCache(
    selectedWalletId !== undefined && wallets !== undefined
      ? [`wallets/${selectedWalletId}`, wallets]
      : null,
    ([_key, wallets]) => {
      const wallet = wallets.find(w => w.walletId === selectedWalletId)
      return wallet
    },
  )

  // balance
  const {
    data: balance,
    isLoading: loadingBalance,
    mutate: revalidateBalance,
  } = useCache(
    selectedWallet ? [`wallets/${selectedWallet.walletId}/balance`, selectedWallet] : null,
    async ([_key, selectedWallet]) => {
      const entropy = fromMnemonic(selectedWallet.seedPhrase)
      const extendedKey = createRootExtendedKey(entropy)
      const { balance, utxos } = await getTxHistory({
        extendedKey,
        purpose: selectedWallet.accounts[0].purpose,
        coinType: selectedWallet.accounts[0].coinType,
        accountStartIndex: selectedWallet.accounts[0].accountIndex,
      })
      return { balance, utxos }
    },
    defaultCacheParams,
  )

  const [useSatoshis, setUseSatoshis] = useState(false)

  // Convert balance to satoshis or keep as BTC based on state
  const displayBalance =
    balance === undefined ? 0 : useSatoshis ? balance.balance * 100000000 : balance.balance

  const formatBalance = (balance: number, useSats: boolean) => {
    if (useSats) {
      return Math.round(balance)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    } else {
      return balance.toLocaleString('pt-BR', { maximumFractionDigits: 8 })
    }
  }

  // Format balance appropriately for each unit
  const formattedBalance = useMemo(
    () => formatBalance(displayBalance, useSatoshis),
    [displayBalance, useSatoshis],
  )

  const toggleUnit = () => {
    setUseSatoshis(prev => !prev)
  }

  return (
    <WalletContext.Provider
      value={{
        wallets,
        loadingWallets,
        revalidateWallets,
        selectedWallet,
        selectedWalletId,
        loadingSelectedWalletId,
        revalidateSelectedWalletId,
        balance: formattedBalance,
        loadingBalance,
        revalidateBalance,
        useSatoshis,
        toggleUnit,
        // revalidate,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

/* export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }

  return context
} */
