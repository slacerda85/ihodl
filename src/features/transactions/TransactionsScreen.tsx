import { UIFriendlyTransaction } from '@/lib/transactions/types'
import { Text, View, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { truncateAddress } from './utils'
import BitcoinLogo from '@/assets/bitcoin-logo'
import { formatBalance } from '../wallet/utils'
import { alpha } from '@/ui/utils'
import { useHeaderHeight } from '@react-navigation/elements'
import { GlassView } from 'expo-glass-effect'
import { useSettings } from '../settings'
import { useTransactions } from './TransactionsProvider'
import { useWallet } from '../wallet'
// import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'

// Define types for our transaction list items
type DateHeader = {
  isDate: true
  date: string
}

type TransactionItem = {
  isDate: false
  tx: UIFriendlyTransaction
  type: 'received' | 'sent' | 'self'
  amount: number
  address: string
}

type ListItem = DateHeader | TransactionItem

export default function TransactionsScreen() {
  const headerHeight = useHeaderHeight()
  const { isDark } = useSettings()
  const router = useRouter()

  const { activeWalletId, loading: loadingWallet, unit } = useWallet()
  const { friendly: transactions, loading: loadingTxState } = useTransactions()

  const loading = loadingWallet || loadingTxState

  // Check if we have cached data for the active wallet
  const hasTransactionData = activeWalletId
    ? transactions.some(cache => cache.walletId === activeWalletId)
    : false

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

  // Agrupar transações por data usando o campo 'date' do UIFriendlyTransaction
  const grouped: Record<string, UIFriendlyTransaction[]> = {}
  for (const txData of transactions) {
    // Usar o campo 'date' diretamente (já vem formatado como string)
    const date = txData.date.split('T')[0] // Extrair apenas a parte da data (YYYY-MM-DD)
    if (!grouped[date]) {
      grouped[date] = []
    }
    grouped[date].push(txData)
  }

  // Ordenar transações dentro de cada data por data (mais recente primeiro)
  for (const date in grouped) {
    grouped[date].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  }

  // Preparar dados para FlatList com cabeçalhos de data
  const data: ListItem[] = []
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  for (const date of sortedDates) {
    // Formatar data para exibição em português brasileiro
    const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    data.push({ isDate: true, date: displayDate })

    for (const txData of grouped[date]) {
      // Determinar endereço de exibição baseado no tipo de transação
      let displayAddress = 'Unknown'
      if (txData.type === 'received') {
        // Para transações recebidas, mostrar o endereço de origem
        displayAddress = txData.fromAddress || 'External'
      } else if (txData.type === 'sent') {
        // Para transações enviadas, mostrar o endereço de destino
        displayAddress = txData.toAddress || 'External'
      } else {
        // Para self-transfer, mostrar um dos endereços da carteira
        displayAddress = txData.fromAddress || 'Self'
      }

      data.push({
        isDate: false,
        tx: txData,
        type: txData.type,
        amount: txData.amount, // Já vem em satoshis
        address: displayAddress,
      })
    }
  }

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if (item.isDate) {
      return <Text style={[styles.date, isDark && styles.dateDark]}>{item.date}</Text>
    } else {
      // Determinar estilo do tipo de transação
      const typeLabel =
        item.type === 'received' ? 'Received' : item.type === 'sent' ? 'Sent' : 'Self Transfer'

      const isPositive = item.type === 'received'
      const prefix = isPositive ? '+' : '-'

      return (
        <Pressable
          onPress={() => {
            // Navigate to transaction details
            router.push(`/transactions/${item.tx.txid}` as any)
          }}
        >
          <GlassView isInteractive style={styles.transactionPressable}>
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
          </GlassView>
        </Pressable>
      )
    }
  }

  return (
    <FlatList
      contentContainerStyle={{
        // paddingTop: headerHeight + 16,
        padding: 20,
        gap: 4,
      }}
      data={data}
      keyExtractor={item => (item.isDate ? item.date : item.tx.txid)}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
    />
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
    color: colors.textSecondary.light,
    fontWeight: '500',
  },
})
