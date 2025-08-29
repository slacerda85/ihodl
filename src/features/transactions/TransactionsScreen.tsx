import { Tx } from '@/models/transaction'
import {
  Text,
  View,
  Pressable,
  FlatList,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native'
import { useEffect } from 'react'
import useStorage from '../storage'
import colors from '@/ui/colors'
import { truncateAddress } from './utils'
import BitcoinLogo from '@/assets/bitcoin-logo'
import { formatBalance } from '../wallet/utils'
import { alpha } from '@/ui/utils'
import { useHeaderHeight } from '@react-navigation/elements'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'

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
  const tabBarHeight = useBottomTabBarHeight()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const activeWalletId = useStorage(state => state.activeWalletId)
  const getTransactionAnalysis = useStorage(state => state.tx.getTransactionAnalysis)
  const walletCaches = useStorage(state => state.tx.walletCaches)
  const store = useStorage()

  // Verificar se as funções existem no store
  const hasFetchTransactions = store.tx && typeof store.tx.fetchTransactions === 'function'

  const loadingWallet = useStorage(state => state.loadingWalletState)
  const loadingTx = useStorage(state => state.tx.loadingTxState)
  const loading = loadingWallet || loadingTx
  const unit = useStorage(state => state.unit)

  // Check if we have cached data for the active wallet
  const hasTransactionData = activeWalletId
    ? walletCaches.some(cache => cache.walletId === activeWalletId)
    : false

  // Trigger fetch transactions if we don't have data
  useEffect(() => {
    if (activeWalletId && !loading && !hasTransactionData && hasFetchTransactions) {
      console.log('🚀 [TransactionsScreen] Executando fetchTransactions para:', activeWalletId)
      store.tx.fetchTransactions(activeWalletId)
    }
  }, [activeWalletId, loading, hasTransactionData, hasFetchTransactions, store.tx])

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
    transactionAnalysis =
      activeWalletId && getTransactionAnalysis && typeof getTransactionAnalysis === 'function'
        ? getTransactionAnalysis(activeWalletId)
        : null

    // Debug: Log transaction analysis
    if (transactionAnalysis) {
      console.log('📊 Transaction Analysis:', {
        balance: transactionAnalysis.balance,
        totalTransactions: transactionAnalysis.transactions?.length || 0,
        utxoCount: transactionAnalysis.utxos?.length || 0,
        stats: transactionAnalysis.stats,
      })
    }
  } catch (error) {
    console.log('Error getting transaction analysis:', error)
  }

  // No transaction analysis or no transactions
  if (
    !transactionAnalysis ||
    !transactionAnalysis.transactions ||
    transactionAnalysis.transactions.length === 0
  ) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: headerHeight + 16 }]}>
        <View style={[styles.empty, isDark && styles.emptyDark]}>
          <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
            No transactions found
          </Text>
          <Text style={[styles.emptySubText, isDark && styles.emptySubTextDark]}>
            Transactions will appear here when you receive or send Bitcoin
          </Text>
        </View>
      </View>
    )
  }

  // Now we know we have valid transaction data
  const { transactions, stats } = transactionAnalysis

  console.log('📋 Processing transactions for display:', {
    transactionCount: transactions.length,
    stats,
  })

  // Agrupar transações por data
  const grouped: Record<string, typeof transactions> = {}
  for (const txData of transactions) {
    // Verificar se blocktime existe e é válido
    if (!txData.tx.blocktime || txData.tx.blocktime <= 0) {
      console.warn('Transação sem blocktime válido:', txData.tx.txid)
      continue
    }

    const date = new Date(txData.tx.blocktime * 1000).toISOString().split('T')[0]
    if (!grouped[date]) {
      grouped[date] = []
    }
    grouped[date].push(txData)
  }

  console.log('📅 Transactions grouped by date:', {
    dateCount: Object.keys(grouped).length,
    dates: Object.keys(grouped),
  })

  // Ordenar transações dentro de cada data por blocktime (mais recente primeiro)
  for (const date in grouped) {
    grouped[date].sort((a, b) => {
      // Verificar se blocktime existe
      if (!a.tx.blocktime || !b.tx.blocktime) return 0
      return b.tx.blocktime - a.tx.blocktime
    })
  }

  // Preparar dados para FlatList com cabeçalhos de data
  const data: ListItem[] = []
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  for (const date of sortedDates) {
    // Formatar data para exibição
    const displayDate = new Date(date).toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    data.push({ isDate: true, date: displayDate })

    for (const txData of grouped[date]) {
      // Determinar endereço de exibição baseado no tipo de transação
      let displayAddress = 'Unknown'
      if (txData.type === 'received') {
        // Para transações recebidas, mostrar o primeiro endereço de origem (se disponível)
        displayAddress = txData.fromAddresses.length > 0 ? txData.fromAddresses[0] : 'External'
      } else if (txData.type === 'sent') {
        // Para transações enviadas, mostrar o primeiro endereço de destino
        displayAddress = txData.toAddresses.length > 0 ? txData.toAddresses[0] : 'External'
      } else {
        // Para self-transfer, mostrar um dos endereços da carteira
        displayAddress = txData.walletAddresses.length > 0 ? txData.walletAddresses[0] : 'Self'
      }

      data.push({
        isDate: false,
        tx: txData.tx,
        type: txData.type,
        amount: Math.abs(txData.netAmount),
        address: displayAddress,
      })
    }
  }

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if (item.isDate) {
      return <Text style={[styles.date, isDark && styles.dateDark]}>{item.date}</Text>
    } else {
      // Verificar se é o primeiro/último item do grupo
      const isFirstInGroup = index === 0 || data[index - 1].isDate
      const isLastInGroup =
        index === data.length - 1 || (index + 1 < data.length && data[index + 1].isDate)

      // Determinar estilo do tipo de transação
      const typeLabel =
        item.type === 'received' ? 'Received' : item.type === 'sent' ? 'Sent' : 'Self Transfer'

      const isPositive = item.type === 'received'
      const prefix = isPositive ? '+' : '-'

      return (
        <View>
          <Pressable
            style={[
              styles.transactionPressable,
              isDark && styles.transactionsPressableDark,
              isFirstInGroup && styles.first,
              isLastInGroup && styles.last,
            ]}
            onPress={() => {
              // Handle transaction press (e.g., navigate to details)
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <BitcoinLogo width={32} height={32} />
              <View>
                <Text style={[styles.type, isDark && styles.typeDark]}>{typeLabel}</Text>
                <Text style={[styles.address, isDark && styles.addressDark]}>
                  {item.type === 'received' ? 'From' : item.type === 'sent' ? 'To' : ''}{' '}
                  {truncateAddress(item.address, 6)}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.balance,
                isDark && styles.balanceDark,
                isPositive ? styles.balancePositive : styles.balanceNegative,
              ]}
            >
              {`${prefix}${formatBalance(item.amount, unit)} ${unit}`}
            </Text>
          </Pressable>
        </View>
      )
    }
  }

  return (
    <View style={{ flex: 1, paddingLeft: 16, paddingRight: 16 }}>
      <FlatList
        contentContainerStyle={{
          paddingTop: headerHeight + 16,
          paddingBottom: tabBarHeight + 16,
          gap: 1,
        }}
        data={data}
        keyExtractor={item => (item.isDate ? item.date : item.tx.txid)}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={{ paddingBottom: 16 }}>
            <Text style={[styles.statsText, isDark && styles.statsTextDark]}>
              {`Received: ${stats.receivedCount} | Sent: ${stats.sentCount} | Self: ${stats.selfCount}`}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
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
    color: colors.text.light,
  },
  statsTextDark: {
    color: colors.text.dark,
  },
  date: {
    paddingTop: 16,
    paddingBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary.light,
  },
  dateDark: {
    color: colors.textSecondary.dark,
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
    backgroundColor: colors.white,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    paddingRight: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    // alignItems: 'center',
  },
  transactionsPressableDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  first: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  last: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
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
    color: colors.success,
  },
  balanceNegative: {
    // color: colors.,
  },
})
