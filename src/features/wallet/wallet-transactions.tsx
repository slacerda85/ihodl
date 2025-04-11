import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, useColorScheme, FlatList, ScrollView } from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { IconSymbol } from '@/shared/ui/icon-symbol'
import { useWallet } from './wallet-provider'
import { MINIMUN_CONFIRMATIONS, Tx } from '@/models/transaction'
import { discoverAccounts } from '@/services/account/account.service'

// List item types for our FlatList
type ListItem =
  | { type: 'header'; id: string; first?: boolean; last?: boolean; date: string }
  | { type: 'transaction'; id: string; first?: boolean; last?: boolean; transaction: Tx }

export default function WalletTransactions() {
  const { selectedWalletId, wallets, purpose } = useWallet()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const wallet = useMemo(
    () => wallets.find(wallet => wallet.walletId === selectedWalletId),
    [selectedWalletId, wallets],
  )
  const [loading, setLoading] = useState<boolean>(false)
  const [transactions, setTransactions] = useState<Tx[]>([])
  const [usedAddresses, setUsedAddresses] = useState<string[]>([])

  const fetchTransactions = useCallback(async () => {
    console.log('wallet-transactions.tsx: Fetching transactions callback called')
    if (!wallet) return
    const account = wallet.accounts.find(account => account.purpose === purpose)
    if (!account) return

    const { discoveredAccounts } = await discoverAccounts(wallet.extendedKey, account.purpose)

    const usedAddresses = discoveredAccounts.flatMap(account =>
      account.addressInfo.map(addressInfo => addressInfo.address),
    )

    setUsedAddresses(usedAddresses)

    const transactions = discoveredAccounts.flatMap(account =>
      account.addressInfo.flatMap(addressInfo => addressInfo.txs),
    )
    setTransactions(transactions)
  }, [wallet, purpose])

  useEffect(() => {
    setLoading(true)
    fetchTransactions()
      .catch(error => {
        console.error('Error fetching transactions:', error)
      })
      .finally(() => {
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Group transactions by date and create a flat list with headers
  const prepareTransactionsData = (): ListItem[] => {
    // Sort transactions by date (newest first)
    const sortedTransactions = [...transactions].sort((a, b) => {
      const dateA = new Date(a.locktime * 1000) // Convert to milliseconds for Date constructor, if blocktime is in seconds
      const dateB = new Date(b.locktime * 1000) // Convert to milliseconds for Date constructor, if blocktime is in seconds

      return dateB.getTime() - dateA.getTime() // Sort by newest first (descending order)
    })

    // Group by date
    const groupedByDate: Record<string, Tx[]> = {}

    sortedTransactions.forEach(transaction => {
      if (!transaction.blocktime) return
      // Get date from transaction locktime
      const date = new Date(transaction.blocktime)

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

    if (groupedByDate !== undefined) {
      Object.entries(groupedByDate).forEach(([dateKey, transactionsForDate]) => {
        // Add date header
        result.push({
          type: 'header',
          id: `header-${dateKey}`,
          date: dateKey,
        })

        // Add transactions for this date
        transactionsForDate?.forEach((transaction, index) => {
          result.push({
            type: 'transaction',
            id: transaction.txid,
            first: index === 0,
            last: index === transactionsForDate?.length - 1,
            transaction,
          })
        })
      })
    }

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

    // Make sure transaction.vout exists and has elements
    if (!transaction.vout || transaction.vout.length === 0) {
      return null
    }

    // Calculate transaction value more accurately
    let transactionValue = 0
    let isReceived = false

    // For received transactions - find outputs to our addresses and sum them
    const ourOutputs = transaction.vout.filter(vout => {
      const address = vout.scriptPubKey?.address
      return usedAddresses.includes(address)
    })

    // For sent transactions - find outputs to external addresses and sum them
    const externalOutputs = transaction.vout.filter(vout => {
      const address = vout.scriptPubKey?.address
      return address && !usedAddresses.includes(address)
    })

    // If we have outputs to our addresses, it's a received transaction
    if (ourOutputs.length > 0) {
      isReceived = true
      transactionValue = ourOutputs.reduce((sum, vout) => sum + vout.value, 0)
    }
    // Otherwise it's a sent transaction
    else if (externalOutputs.length > 0) {
      isReceived = false
      transactionValue = externalOutputs.reduce((sum, vout) => sum + vout.value, 0)
    }

    // Format transaction value with sign
    const formattedValue = `${isReceived ? '+' : '-'}${transactionValue.toLocaleString('pt-BR', {
      maximumFractionDigits: 8,
    })} BTC`

    // Get the relevant scriptPubKey for display
    // For received transactions, use our first address that received funds
    // For sent transactions, use the first external address
    const scriptPubKey = isReceived ? ourOutputs[0]?.scriptPubKey : externalOutputs[0]?.scriptPubKey

    if (!scriptPubKey) {
      return null
    }

    // Truncate address for display with proper null check
    const address = scriptPubKey.address || ''
    const truncatedAddress =
      address.length > 20
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
              {transaction.confirmations === undefined ||
              transaction?.confirmations < MINIMUN_CONFIRMATIONS
                ? 'Pending'
                : 'Confirmed'}
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
                  scriptPubKey.type === 'p2sh' ? styles.lightningBadge : styles.onChainBadge,
                ]}
              >
                <IconSymbol
                  name={scriptPubKey.type === 'p2sh' ? 'bolt.fill' : 'link'}
                  size={12}
                  weight="bold"
                  color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
                />
                <Text style={[styles.networkBadgeText, isDark && styles.networkBadgeTextDark]}>
                  {scriptPubKey.type === 'p2sh' ? 'Lightning' : 'On chain'}
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

  /* const ListHeader = () => (
    <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
      Recent Transactions
    </Text>
  ) */

  if (loading) {
    return (
      <View style={styles.transactionsSection}>
        <ScrollView>
          <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
            <IconSymbol
              name="arrow.2.circlepath"
              size={32}
              color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            />
            <Text style={[styles.emptyStateText, isDark && styles.emptyStateTextDark]}>
              Loading transactions...
            </Text>
          </View>
        </ScrollView>
      </View>
    )
  }

  if (transactions?.length === 0) {
    return (
      <View style={styles.transactionsSection}>
        {/* <ListHeader /> */}
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
        // ListHeaderComponent={<ListHeader />}
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
