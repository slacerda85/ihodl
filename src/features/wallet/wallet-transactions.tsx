import React from 'react'
import { View, Text, StyleSheet, useColorScheme, FlatList, ScrollView } from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { IconSymbol } from '@/shared/ui/icon-symbol'

interface Transaction {
  id: string
  transactionDate: Date
  value: number
  contactName?: string
  address: string
  transactionType: 'P2WPKH' | 'P2TR'
  network: 'onChain' | 'lightning'
}

// New interface for our list items
type ListItem =
  | { type: 'header'; id: string; date: string }
  | { type: 'transaction'; id: string; transaction: Transaction }

export default function WalletTransactions() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  // Mock transaction data - in a real app you would get these from your wallet provider
  const transactions: Transaction[] = [
    {
      id: '1',
      transactionDate: new Date(2025, 2, 5), // March 5, 2025
      value: 0.0012,
      contactName: 'Alice',
      address: 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp8cy',
      transactionType: 'P2WPKH',
      network: 'onChain',
    },
    {
      id: '2',
      transactionDate: new Date(2025, 2, 5), // March 3, 2025
      value: -0.0005,
      address: 'bc1pyxpexx6kzhng3cdr7jpfpf5euwzkhcmqn3hzmngssk8d9ntgn3eqdk0dg3',
      transactionType: 'P2WPKH',
      network: 'onChain',
    },
    {
      id: '3',
      transactionDate: new Date(2025, 2, 1), // March 1, 2025
      value: 0.0003,
      contactName: 'Bob',
      address: 'lnbc500u1p3qkglupp...',
      transactionType: 'P2TR',
      network: 'lightning',
    },
    {
      id: '4',
      transactionDate: new Date(2025, 1, 28), // February 28, 2025
      value: -0.0008,
      address: 'bc1q9h8rsyf9wtwkjz47xklceleqg0aphuwnv5mztq',
      transactionType: 'P2WPKH',
      network: 'onChain',
    },
    {
      id: '5',
      transactionDate: new Date(2025, 1, 25), // February 25, 2025
      value: 0.0015,
      contactName: 'Carol',
      address: 'lnbc150u1p3q9hjdpp...',
      transactionType: 'P2TR',
      network: 'lightning',
    },
  ]

  // Group transactions by date and create a flat list with headers
  const prepareTransactionsData = (): ListItem[] => {
    // Sort transactions by date (newest first)
    const sortedTransactions = [...transactions].sort(
      (a, b) => b.transactionDate.getTime() - a.transactionDate.getTime(),
    )

    // Group by date
    const groupedByDate: Record<string, Transaction[]> = {}

    sortedTransactions.forEach(transaction => {
      const dateKey = transaction.transactionDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = []
      }

      groupedByDate[dateKey].push(transaction)
    })

    // Create flat list with headers and transactions
    const result: ListItem[] = []

    Object.entries(groupedByDate).forEach(([dateKey, transactionsForDate]) => {
      // Add date header
      result.push({
        type: 'header',
        id: `header-${dateKey}`,
        date: dateKey,
      })

      // Add transactions for this date
      transactionsForDate.forEach(transaction => {
        result.push({
          type: 'transaction',
          id: transaction.id,
          transaction,
        })
      })
    })

    return result
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    // Render date header
    if (item.type === 'header') {
      return (
        <View style={[styles.dateHeader, isDark && styles.dateHeaderDark]}>
          <Text style={[styles.dateHeaderText, isDark && styles.dateHeaderTextDark]}>
            {item.date}
          </Text>
        </View>
      )
    }

    // Render transaction item
    const { transaction } = item
    const isReceived = transaction.value > 0

    // Format transaction value with sign
    const formattedValue = `${isReceived ? '+' : ''}${transaction.value.toFixed(8)} BTC`

    // Truncate address for display
    const shortenedAddress =
      transaction.address.length > 20
        ? `${transaction.address.substring(0, 10)}...${transaction.address.substring(transaction.address.length - 10)}`
        : transaction.address

    return (
      <View style={[styles.transactionItem, isDark && styles.transactionItemDark]}>
        {/* <View style={styles.transactionIconContainer}>
          <View
            style={[styles.transactionIcon, isReceived ? styles.receivedIcon : styles.sentIcon]}
          >
            <IconSymbol name={isReceived ? 'arrow.down' : 'arrow.up'} size={16} color="white" />
          </View>
        </View> */}

        <View style={styles.transactionDetails}>
          <View style={styles.transactionHeader}>
            <Text style={[styles.contactName, isDark && styles.contactNameDark]}>
              {transaction.contactName || (isReceived ? 'Received' : 'Sent')}
            </Text>
            <Text
              style={[
                styles.transactionValue,
                isReceived ? styles.receivedValue : styles.sentValue,
              ]}
            >
              {formattedValue}
            </Text>
          </View>

          <View style={styles.transactionMetadata}>
            <Text style={[styles.addressText, isDark && styles.addressTextDark]}>
              {shortenedAddress}
            </Text>
            <View style={styles.flexRow}>
              <View style={styles.transactionTypeBadge}>
                <Text style={styles.transactionTypeText}>{transaction.transactionType}</Text>
              </View>
              <View
                style={[
                  styles.networkBadge,
                  transaction.network === 'lightning' ? styles.lightningBadge : styles.onChainBadge,
                ]}
              >
                <Text style={styles.networkBadgeText}>
                  {transaction.network === 'lightning' ? '⚡ Lighting' : '⛓️ On chain'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    )
  }

  const EmptyTransactionList = () => (
    <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
      <IconSymbol
        name="doc.text"
        size={32}
        color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
      />
      <Text style={[styles.emptyStateText, isDark && styles.emptyStateTextDark]}>
        No transactions yet
      </Text>
    </View>
  )

  const ListHeader = () => (
    <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
      Recent Transactions
    </Text>
  )

  if (transactions.length === 0) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <ListHeader />
        <EmptyTransactionList />
      </View>
    )
  }

  // Use the prepared data that includes date headers
  const listData = prepareTransactionsData()

  return (
    <FlatList
      style={[styles.container, isDark && styles.containerDark]}
      data={listData}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.transactionsList}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<ListHeader />}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
    // padding: 16,
  },
  containerDark: {
    backgroundColor: colors.background.dark,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 16,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  transactionsList: {
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    borderWidth: 1,
    borderColor: alpha(colors.border.light, 0.2),
    borderRadius: 8,
    gap: 12,
  },
  emptyStateDark: {
    borderColor: alpha(colors.border.dark, 0.2),
  },
  emptyStateText: {
    color: colors.textSecondary.light,
  },
  emptyStateTextDark: {
    color: colors.textSecondary.dark,
  },
  transactionItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 8,
    marginBottom: 8,
  },
  transactionItemDark: {
    backgroundColor: colors.black,
  },
  transactionIconContainer: {
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receivedIcon: {
    backgroundColor: colors.secondary,
  },
  sentIcon: {
    backgroundColor: colors.warning,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
  },
  contactNameDark: {
    color: colors.text.dark,
  },
  transactionValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  receivedValue: {
    color: colors.success,
  },
  sentValue: {
    color: colors.textSecondary.light,
  },
  transactionMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  transactionDateDark: {
    color: colors.textSecondary.dark,
  },
  transactionTypeBadge: {
    backgroundColor: alpha(colors.primary, 0.1),
    padding: 4,
    borderRadius: 4,
  },
  transactionTypeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '500',
  },
  networkBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  lightningBadge: {
    padding: 4,
    backgroundColor: alpha(colors.primary, 0.1), // Orange color for lightning
    // borderWidth: 1,
    // borderColor: alpha(colors.primary, 0.2), // Orange color
  },
  onChainBadge: {
    padding: 4,
    backgroundColor: alpha(colors.secondary, 0.1), // Blue color for on-chain
    // borderRadius: 4,
    // borderWidth: 1,
    // borderColor: alpha(colors.secondary, 0.2), // Blue color
  },
  networkBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary.light,
  },
  addressText: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  addressTextDark: {
    color: colors.textSecondary.dark,
  },
  dateHeader: {
    paddingVertical: 8,
    // marginTop: 8,
    // marginBottom: 4,
    // borderBottomWidth: 1,
    // borderBottomColor: alpha(colors.border.light, 0.2),
  },
  dateHeaderDark: {
    borderBottomColor: alpha(colors.border.dark, 0.2),
  },
  dateHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary.light,
  },
  dateHeaderTextDark: {
    color: colors.textSecondary.dark,
  },
  flexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
  },

  // Update transactionMetadata to not account for date (removed date)
})
