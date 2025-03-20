import { useWallet } from '@/features/wallet/wallet-provider'
import { useNavigation } from 'expo-router'
import { useEffect } from 'react'
import { Text, View, StyleSheet, FlatList, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Tx } from '@mempool/mempool.js/lib/interfaces/bitcoin/transactions'
import WalletTransactions from '@/features/wallet/wallet-transactions'

const TransactionItem = ({ tx }: { tx: Tx }) => {
  // Determine if transaction is incoming or outgoing (simplified logic)
  const isIncoming = tx.vin.some(input => input.is_coinbase) || tx.fee < 0

  // Format date - assuming status.confirmed_time is a timestamp
  const date = tx.status.confirmed
    ? new Date(tx.status.block_time * 1000).toLocaleDateString()
    : 'Pending'

  return (
    <TouchableOpacity style={styles.txItem}>
      <View style={styles.txIconContainer}>
        <Ionicons
          name={isIncoming ? 'arrow-down-circle' : 'arrow-up-circle'}
          size={24}
          color={isIncoming ? '#4CAF50' : '#F44336'}
        />
      </View>

      <View style={styles.txDetails}>
        <Text style={styles.txType}>{isIncoming ? 'Received' : 'Sent'}</Text>
        <Text style={styles.txDate}>{date}</Text>
        <Text style={styles.txId} numberOfLines={1} ellipsizeMode="middle">
          {tx.txid}
        </Text>
      </View>

      <View style={styles.txAmount}>
        <Text style={[styles.amount, isIncoming ? styles.incoming : styles.outgoing]}>
          {isIncoming ? '+' : '-'} {Math.abs(tx.fee).toFixed(8)} BTC
        </Text>
        <Text style={styles.status}>{tx.status?.confirmed ? 'Confirmed' : 'Pending'}</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function WalletTransactionsRoute() {
  const navigation = useNavigation()
  const { wallets, selectedWalletId } = useWallet()

  const walletName = wallets.find(wallet => wallet.walletId === selectedWalletId)?.walletName
  const transactions =
    wallets.find(wallet => wallet.walletId === selectedWalletId)?.transactions || []

  useEffect(() => {
    navigation.setOptions({
      title: `Transactions - ${walletName}`,
    })
  }, [navigation, selectedWalletId, walletName])

  return <WalletTransactions />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  list: {
    padding: 8,
  },
  txItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  txIconContainer: {
    marginRight: 12,
  },
  txDetails: {
    flex: 1,
  },
  txType: {
    fontSize: 16,
    fontWeight: '600',
  },
  txDate: {
    color: '#666',
    fontSize: 14,
    marginTop: 2,
  },
  txId: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  txAmount: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
  },
  incoming: {
    color: '#4CAF50',
  },
  outgoing: {
    color: '#F44336',
  },
  status: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  separator: {
    height: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
})

/* <View style={styles.container}>
      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No transactions yet</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={tx => tx.txid}
          renderItem={({ item }) => <TransactionItem tx={item} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View> */
