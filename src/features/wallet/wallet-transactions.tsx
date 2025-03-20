import React from 'react'
import { View, Text, StyleSheet, useColorScheme, FlatList, ScrollView } from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { IconSymbol } from '@/shared/ui/icon-symbol'
import { useWallet } from './wallet-provider'
import { Tx } from '@mempool/mempool.js/lib/interfaces/bitcoin/transactions'

// Extended transaction type with our app-specific fields

// List item types for our FlatList
type ListItem =
  | { type: 'header'; id: string; first?: boolean; last?: boolean; date: string }
  | { type: 'transaction'; id: string; first?: boolean; last?: boolean; transaction: Tx }

export default function WalletTransactions() {
  const { selectedWalletId, wallets } = useWallet()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const transactions =
    wallets.find(wallet => wallet.walletId === selectedWalletId)?.transactions || []

  // Group transactions by date and create a flat list with headers
  const prepareTransactionsData = (): ListItem[] => {
    // Sort transactions by date (newest first)
    const sortedTransactions = [...transactions].sort((a, b) => {
      const dateA = new Date(a.status.block_time * 1000)
      const dateB = new Date(b.status.block_time * 1000)
      return dateB.getTime() - dateA.getTime()
    })

    // Group by date
    const groupedByDate: Record<string, Tx[]> = {}

    sortedTransactions.forEach(transaction => {
      // Get date from transaction locktime
      const date = new Date(transaction.status.block_time * 1000)

      const dateKey = date.toLocaleDateString('en-US', {
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
      transactionsForDate.forEach((transaction, index) => {
        result.push({
          type: 'transaction',
          id: transaction.txid,
          first: index === 0,
          last: index === transactionsForDate.length - 1,
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
    const isReceived = transaction.vout[0].value > 0

    // Format transaction value with sign
    const formattedValue = `${isReceived ? '+' : ''}${transaction.vout[0].value.toLocaleString(
      'pt-BR',
      {
        maximumFractionDigits: 8,
      },
    )} BTC`

    // Truncate address for display
    const address = transaction.vout[0].scriptpubkey_address
    const truncatedAddress =
      address?.length > 20
        ? `${address.substring(0, 10)}...${address.substring(address.length - 10)}`
        : address

    return (
      <View
        style={[
          styles.transactionItem,
          item.first && styles.transactionItemFirst,
          item.last && styles.transactionItemLast,
          isDark && styles.transactionItemDark,
        ]}
      >
        <View style={styles.transactionDetails}>
          <View style={styles.transactionHeader}>
            <Text style={[styles.status, isDark && styles.statusDark]}>
              {transaction.status.confirmed ? 'Confirmed' : 'Pending'}
            </Text>
            <Text
              style={[
                styles.transactionValue,
                isReceived
                  ? styles.receivedValue
                  : isDark
                    ? styles.sentValueDark
                    : styles.sentValue,
              ]}
            >
              {formattedValue}
            </Text>
          </View>

          <View style={styles.transactionMetadata}>
            <Text style={[styles.addressText, isDark && styles.addressTextDark]}>
              {truncatedAddress}
            </Text>
            <View style={styles.flexRow}>
              <View
                style={[
                  styles.networkBadge,
                  transaction.vout[0].scriptpubkey_type === 'p2sh'
                    ? styles.lightningBadge
                    : styles.onChainBadge,
                ]}
              >
                <IconSymbol
                  name={transaction.vout[0].scriptpubkey_type === 'p2sh' ? 'bolt.fill' : 'link'}
                  size={12}
                  weight="bold"
                  color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
                />
                <Text style={[styles.networkBadgeText, isDark && styles.networkBadgeTextDark]}>
                  {transaction.vout[0].scriptpubkey_type === 'p2sh' ? 'Lightning' : 'On chain'}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <IconSymbol
          name="chevron.right"
          size={20}
          color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
        />
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
      <View style={styles.transactionsSection}>
        <ListHeader />
        <EmptyTransactionList />
      </View>
    )
  }

  // Use the prepared data that includes date headers
  const listData = prepareTransactionsData()

  return (
    <View style={styles.transactionsSection}>
      <FlatList<ListItem>
        data={listData}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.flatList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<ListHeader />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 16,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  flatList: {
    paddingBottom: 48,
    gap: 1,
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
  transactionsSection: {
    flex: 1,
    padding: 16,
    paddingTop: 24,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
  },
  transactionItemFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  transactionItemLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  transactionItemDark: {
    backgroundColor: alpha(colors.white, 0.1),
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
    paddingBottom: 4,
  },
  status: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
  },
  statusDark: {
    color: colors.text.dark,
  },
  transactionValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  receivedValue: {
    color: colors.positive,
  },
  sentValue: {
    color: colors.text.light,
  },
  sentValueDark: {
    color: colors.text.dark,
  },
  transactionMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  transactionDate: {
    fontSize: 10,
    color: colors.textSecondary.light,
  },
  transactionDateDark: {
    color: colors.textSecondary.dark,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 4,
  },
  lightningBadge: {
    // backgroundColor: alpha(colors.primary, 0.7),
  },
  onChainBadge: {
    // backgroundColor: colors.secondary,
  },
  networkBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary.light,
  },
  networkBadgeTextDark: {
    color: colors.textSecondary.dark,
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
  },
  dateHeaderDark: {
    borderBottomColor: alpha(colors.border.dark, 0.2),
  },
  dateHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary.light,
  },
  dateHeaderTextDark: {
    color: colors.textSecondary.dark,
  },
  flexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
})
