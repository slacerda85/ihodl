import { createContext, ReactNode, useContext, useMemo, useState } from 'react'
import { getWallets, setSelectedWalletId, getSelectedWalletId, getBalance } from '@/lib/wallet'
import { WalletData } from '@/models/wallet'
import useCache from '@/features/cache'
import { KeyedMutator } from 'swr'

type WalletContextType = {
  // wallet data
  wallets: WalletData[] | undefined
  selectedWallet: WalletData | undefined
  selectedWalletId: string | undefined
  selectWalletId: (walletId: string) => Promise<{ success: boolean }>
  refreshSelectedWalletId: () => Promise<string | undefined>
  // balance data
  balance: string
  // selectedWalletBalance: string
  balanceLoading: boolean
  useSatoshis: boolean
  toggleUnit: () => void
  loading: boolean
  revalidateBalance: KeyedMutator<number>
}

const WalletContext = createContext({} as WalletContextType)

export default function WalletProvider({ children }: { children: ReactNode }) {
  const defaultCacheParams = {
    // 10 minutes
    refreshInterval: 5 * 60 * 1000,
  }

  const { data: wallets, isLoading: walletsLoading } = useCache(
    'wallets',
    getWallets,
    defaultCacheParams,
  )

  const {
    data: selectedWalletId,
    isLoading: walletIdLoading,
    mutate: refreshSelectedWalletId,
  } = useCache(wallets !== undefined ? 'selectedWalletId' : null, getSelectedWalletId)

  const { data: selectedWallet } = useCache(
    selectedWalletId !== undefined && wallets !== undefined
      ? [`wallets/${selectedWalletId}`, wallets]
      : null,
    ([_key, wallets]) => {
      const wallet = wallets.find(w => w.walletId === selectedWalletId)
      return wallet
    },
    defaultCacheParams,
  )

  async function selectWalletId(walletId: string) {
    const { success } = await setSelectedWalletId(walletId)
    if (success) {
      // update cache
      await refreshSelectedWalletId()
    }
    return { success }
  }

  const loading = useMemo(
    () => walletsLoading || walletIdLoading,
    [walletsLoading, walletIdLoading],
  )

  // balance
  const {
    data: balance,
    isLoading: balanceLoading,
    mutate: revalidateBalance,
  } = useCache(
    selectedWallet ? [`wallets/${selectedWallet.walletId}/balance`, selectedWallet] : null,
    async ([_key, selectedWallet]) => {
      const balance = await getBalance(selectedWallet)
      return balance
    },
    defaultCacheParams,
  )

  const [useSatoshis, setUseSatoshis] = useState(false)

  // Convert balance to satoshis or keep as BTC based on state
  const displayBalance = balance === undefined ? 0 : useSatoshis ? balance * 100000000 : balance

  // Format balance appropriately for each unit
  const formattedBalance = useMemo(
    () =>
      balance === undefined
        ? '0'
        : useSatoshis
          ? Math.round(displayBalance)
              .toString()
              .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
          : balance?.toLocaleString('pt-BR', { maximumFractionDigits: 8 }),
    [balance, displayBalance, useSatoshis],
  )

  const toggleUnit = () => {
    setUseSatoshis(prev => !prev)
  }

  return (
    <WalletContext.Provider
      value={{
        wallets,
        selectedWallet,
        selectedWalletId,
        selectWalletId,
        refreshSelectedWalletId,
        loading,
        balance: formattedBalance,
        balanceLoading,
        useSatoshis,
        toggleUnit,
        revalidateBalance,
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
