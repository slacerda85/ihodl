import { Tx, TxHistory, UTXO, Vin, Vout } from '@/models/transaction'
import { Text, View, Pressable, FlatList, StyleSheet, Image, useColorScheme } from 'react-native'
import useStore from '../store'
import colors from '@/shared/theme/colors'
import { truncateAddress } from './utils'
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import { ReactNode } from 'react'
import { formatBalance } from '../wallet/utils'
import { alpha } from '@/shared/theme/utils'
import { useHeaderHeight } from '@react-navigation/elements'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import ScreenContainer from '@/shared/ui/ScreenContainer'

const purposeToLabel: Record<number, string> = {
  44: 'Legacy',
  49: 'SegWit',
  84: 'Native SegWit',
  // Add more purposes as needed
}

const purposeToIcon: Record<number, ReactNode> = {
  44: <BitcoinLogo width={32} height={32} />,
  49: <BitcoinLogo width={32} height={32} />,
  84: <BitcoinLogo width={32} height={32} />,
  86: (
    <Image
      source={require('@/shared/assets/lightning-logo.png')}
      style={{ width: 32, height: 32 }}
    />
  ),
  // Add more purposes as needed
}

// Define types for our transaction list items
type DateHeader = {
  isDate: true
  date: string
}

type TransactionItem = {
  isDate: false
  tx: Tx
  type: 'Received' | 'Sent'
  amount: number
  address: string
}

type ListItem = DateHeader | TransactionItem

// Type for transaction details
interface TransactionDetails {
  type: 'Received' | 'Sent'
  amount: number
  address: string
}

export default function TransactionsScreen() {
  const headerHeight = useHeaderHeight()
  const tabBarHeight = useBottomTabBarHeight()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const activeWalletId = useStore(state => state.activeWalletId)
  const transactions = useStore(state => state.transactions)
  const txHistory = transactions.find(item => item.walletId === activeWalletId)?.txHistory || []

  const loading = useStore(state => state.loading)
  const unit = useStore(state => state.unit)
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading...</Text>
      </View>
    )
  }

  // Collect all wallet addresses
  const walletAddresses = new Set(
    txHistory.flatMap(item => [item.receivingAddress, item.changeAddress]),
  )

  // Deduplicate transactions by txid
  const allTxsMap = new Map<string, Tx>()
  for (const item of txHistory) {
    for (const tx of item.txs) {
      allTxsMap.set(tx.txid, tx)
    }
  }
  const allTxs = Array.from(allTxsMap.values())

  // Create UTXO map for input address lookup
  const utxoMap: Record<string, string> = {}
  for (const tx of allTxs) {
    for (const vout of tx.vout) {
      utxoMap[`${tx.txid}-${vout.n}`] = vout.scriptPubKey.address
    }
  }

  // Function to determine transaction details
  function getTxDetails(tx: Tx): TransactionDetails {
    const inputsFromWallet = tx.vin.filter(vin => {
      const prevAddress = utxoMap[`${vin.txid}-${vin.vout}`]
      return prevAddress && walletAddresses.has(prevAddress)
    })
    const outputsToWallet = tx.vout.filter(vout => walletAddresses.has(vout.scriptPubKey.address))
    const outputsToExternal = tx.vout.filter(
      vout => !walletAddresses.has(vout.scriptPubKey.address),
    )

    if (inputsFromWallet.length === 0 && outputsToWallet.length > 0) {
      const amount = outputsToWallet.reduce((sum, vout) => sum + vout.value, 0)
      return { type: 'Received', amount, address: 'external' }
    } else {
      if (outputsToExternal.length > 0) {
        const amount = outputsToExternal.reduce((sum, vout) => sum + vout.value, 0)
        const address = outputsToExternal[0].scriptPubKey.address
        return { type: 'Sent', amount, address }
      } else {
        return { type: 'Sent', amount: 0, address: 'self' }
      }
    }
  }

  // Group transactions by date
  const grouped: Record<string, Tx[]> = {}
  for (const tx of allTxs) {
    const date = new Date(tx.blocktime * 1000).toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    if (!grouped[date]) {
      grouped[date] = []
    }
    grouped[date].push(tx)
  }

  // Sort transactions within each date by blocktime (newest first)
  for (const date in grouped) {
    grouped[date].sort((a, b) => b.blocktime - a.blocktime)
  }

  // Prepare data for FlatList with date headers
  const data: ListItem[] = []
  const sortedDates = Object.keys(grouped).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  )
  for (const date of sortedDates) {
    data.push({ isDate: true, date })
    for (const tx of grouped[date]) {
      const details = getTxDetails(tx)
      data.push({ isDate: false, tx, ...details })
    }
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.isDate) {
      return <Text style={styles.date}>{item.date}</Text>
    } else {
      return (
        <View>
          <Pressable
            style={[styles.transactionPressable, isDark && styles.transactionsPressableDark]}
            onPress={() => {
              // Handle transaction press (e.g., navigate to details)
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <BitcoinLogo width={32} height={32} />
              <View>
                <Text style={[styles.type, isDark && styles.typeDark]}>{item.type}</Text>

                <Text style={[styles.address, isDark && styles.addressDark]}>
                  {item.type === 'Received' ? 'From' : 'To'} {truncateAddress(item.address, 6)}
                </Text>
              </View>
            </View>
            <Text
              style={(styles.balance, isDark && styles.balanceDark)}
            >{`${formatBalance(item.amount, unit)} ${unit}`}</Text>
          </Pressable>
        </View>
      )
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={{
          paddingTop: headerHeight,
          paddingBottom: tabBarHeight,
          gap: 8,
        }}
        data={data}
        keyExtractor={item => (item.isDate ? item.date : item.tx.txid)}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={[styles.empty, isDark && styles.emptyDark]}>
            <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
              {activeWalletId === undefined
                ? 'Select a wallet to view transactions'
                : 'No transactions found'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        // Adjust this value to match your tab bar height
      />
      {/* tab bar height */}
    </View>
  )
}

const styles = StyleSheet.create({
  // Define your styles here
  container: {
    padding: 16,
  },
  date: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: 'semibold',
    color: colors.textSecondary.light,
  },
  dateDark: {
    color: colors.textSecondary.dark,
  },
  type: {
    fontSize: 16,
    fontWeight: 'bold',
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
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionsPressableDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  balance: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  balanceDark: {
    color: colors.text.dark,
  },
  empty: {
    height: 128,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  emptyDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  emptyTextDark: {
    color: colors.textSecondary.dark,
  },
})
