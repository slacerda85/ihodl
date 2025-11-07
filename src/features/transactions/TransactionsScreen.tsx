import { Tx } from '@/lib/transactions/types'
import { Text, View, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native'
import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { truncateAddress } from './utils'
import BitcoinLogo from '@/assets/bitcoin-logo'
import { formatBalance } from '../wallet/utils'
import { alpha } from '@/ui/utils'
import { useHeaderHeight } from '@react-navigation/elements'
import { useWallet } from '@/features/wallet'
import { useTransactions } from '@/features/transactions'
import { useSettings } from '@/features/settings'
import { getWalletSeedPhrase } from '@/lib/secureStorage'
import { GlassView } from 'expo-glass-effect'
// import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'

// Define types for our transaction list items
type DateHeader = {
  isDate: true
  date: string
}

type TransactionItem = {
  isDate: false
  tx: Tx
  type: 'received' | 'sent' | 'self'
  amount: number
  address: string
}

type ListItem = DateHeader | TransactionItem

export default function TransactionsScreen() {
  const headerHeight = useHeaderHeight()
  const { isDark } = useSettings()
  const router = useRouter()

  const { state: walletState } = useWallet()
  const { activeWalletId, loadingWalletState: loadingWallet, unit } = walletState
  const activeWallet = walletState.wallets.find(w => w.walletId === activeWalletId)
  const { state: transactionsState } = useTransactions()
  const { cachedTransactions, loadingTxState: loadingTx } = transactionsState

  const loading = loadingWallet || loadingTx

  // Check if we have cached data for the active wallet
  const hasTransactionData = activeWalletId
    ? cachedTransactions.some(cache => cache.walletId === activeWalletId)
    : false

  // Trigger fetch transactions if we don't have data
  useEffect(() => {
    const fetchTxData = async () => {
      if (activeWalletId && !loading && !hasTransactionData && activeWallet) {
        try {
          // TODO: Implement fetchTransactions
          // const password = '' // Temporary: assume no password for now
          // const seedPhrase = await getWalletSeedPhrase(activeWalletId, password)
          // if (seedPhrase) {
          //   console.log('🚀 [TransactionsScreen] Executando fetchTransactions para:', activeWalletId)
          //   fetchTransactions(activeWalletId, seedPhrase)
          // } else {
          //   console.error('No seed phrase found for wallet:', activeWalletId)
          // }
        } catch (error) {
          console.error('Error getting wallet seed phrase:', error)
        }
      }
    }

    fetchTxData()
  }, [activeWalletId, loading, hasTransactionData, activeWallet])

  // Loading state - show this prominently
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: headerHeight + 16 }]}>
        <View style={[styles.loadingBox, isDark && styles.loadingBoxDark]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    )
  }

  // No wallet selected
  if (!activeWalletId) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: headerHeight + 16 }]}>
        <View style={[styles.empty, isDark && styles.emptyDark]}>
          <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
            Select a wallet to view transactions
          </Text>
        </View>
      </View>
    )
  }

  // No transaction data available yet - show loading
  if (!hasTransactionData) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: headerHeight + 16 }]}>
        <View style={[styles.empty, isDark && styles.emptyDark]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
            Loading transactions...
          </Text>
          <Text style={[styles.emptySubText, isDark && styles.emptySubTextDark]}>
            Please wait while we sync your wallet
          </Text>
        </View>
      </View>
    )
  }

  // Get transaction analysis - this is optional, if it fails we show empty state
  let transactionAnalysis = null
  try {
    // TODO: Implement getTransactionAnalysis
    transactionAnalysis = null
    // transactionAnalysis =
    //   activeWalletId && getTransactionAnalysis && typeof getTransactionAnalysis === 'function'
    //     ? getTransactionAnalysis(activeWalletId)
    //     : null
  } catch (error) {
    console.error('Error getting transaction analysis:', error)
  }

  // No transaction analysis or no transactions - show empty state for now
  return (
    <View style={[styles.emptyContainer, { paddingTop: headerHeight + 16 }]}>
      <View style={[styles.empty, isDark && styles.emptyDark]}>
        <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
          Transactions feature under development
        </Text>
        <Text style={[styles.emptySubText, isDark && styles.emptySubTextDark]}>
          Transaction functionality will be implemented in a future update
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  loadingBox: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    minWidth: 200,
  },
  loadingBoxDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
    textAlign: 'center',
  },
  loadingTextDark: {
    color: colors.text.dark,
  },
  loadingSubText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  loadingSubTextDark: {
    color: colors.textSecondary.dark,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  empty: {
    flex: 1,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 24,
    gap: 12,
  },
  emptyDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.light,
    textAlign: 'center',
  },
  emptyTextDark: {
    color: colors.text.dark,
  },
  emptySubText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  emptySubTextDark: {
    color: colors.textSecondary.dark,
  },
  statsText: {
    fontSize: 14,
    color: alpha(colors.textSecondary.light, 0.7),
  },
  statsTextDark: {
    color: alpha(colors.textSecondary.dark, 0.7),
  },
  date: {
    paddingLeft: 16,
    paddingTop: 16,
    // paddingBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: alpha(colors.textSecondary.light, 0.5),
  },
  dateDark: {
    color: alpha(colors.textSecondary.dark, 0.5),
  },
  type: {
    fontSize: 16,
    // fontWeight: 'semibold',
    color: colors.text.light,
  },
  typeDark: {
    color: colors.text.dark,
  },
  address: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  addressDark: {
    color: colors.textSecondary.dark,
  },
  transactionPressable: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    paddingRight: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 32,
  },
  transactionsPressableDark: {
    // backgroundColor: alpha(colors.white, 0.1),
  },
  first: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  last: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  balance: {
    fontSize: 16,
    // fontWeight: 'bold',
    color: colors.text.light,
  },
  balanceDark: {
    color: colors.text.dark,
  },
  balancePositive: {
    color: '#FFA500',

    fontWeight: '600',
  },
  balanceNegative: {
    color: colors.disabled,
    fontWeight: '500',
  },
})
