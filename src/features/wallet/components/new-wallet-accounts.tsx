import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { useState } from 'react'
import { DiscoveredAccount } from '@/shared/lib/bitcoin/account/account'
import { Tx } from '@/shared/models/transaction'
import { SafeAreaView } from 'react-native-safe-area-context'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'

interface WalletAccountsProps {
  isLoading: boolean
  discoveredAccounts: DiscoveredAccount[]
}

export default function WalletAccounts({ isLoading, discoveredAccounts }: WalletAccountsProps) {
  const [expandedAccount, setExpandedAccount] = useState<number | null>(null)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedTxs, setSelectedTxs] = useState<Tx[]>([])

  const handleAccountPress = (accountIndex: number) => {
    setExpandedAccount(expandedAccount === accountIndex ? null : accountIndex)
  }

  const openTransactionsModal = (address: string, transactions: Tx[]) => {
    setSelectedAddress(address)
    setSelectedTxs(transactions)
    setModalVisible(true)
  }

  const renderAddress = ({ item }: { item: { address: string; index: number; txs: Tx[] } }) => {
    const hasTxs = item.txs.length > 0

    return (
      <View style={styles.addressItem}>
        <View style={styles.addressInfo}>
          <Text style={styles.addressIndex}>Address #{item.index}</Text>
          <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
            {item.address}
          </Text>
          <Text style={styles.txCount}>
            {item.txs.length} transaction{item.txs.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {hasTxs && (
          <TouchableOpacity
            style={styles.viewButton}
            onPress={() => openTransactionsModal(item.address, item.txs)}
          >
            <Text style={styles.viewButtonText}>View Transactions</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  const renderAccount = ({ item }: { item: DiscoveredAccount }) => {
    const isExpanded = expandedAccount === item.index
    const usedAddresses = item.discovered.filter(addr => addr.txs.length > 0)
    const totalTxs = item.discovered.reduce((sum, addr) => sum + addr.txs.length, 0)

    return (
      <View style={styles.accountContainer}>
        <TouchableOpacity
          style={styles.accountHeader}
          onPress={() => handleAccountPress(item.index)}
        >
          <Text style={styles.accountTitle}>Account #{item.index}</Text>
          <View style={styles.accountSummary}>
            <Text style={styles.summaryText}>
              {usedAddresses.length} used address{usedAddresses.length !== 1 ? 'es' : ''}
            </Text>
            <Text style={styles.summaryText}>
              {totalTxs} transaction{totalTxs !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.expandCollapseText}>{isExpanded ? '▼' : '►'}</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <FlatList
            data={item.discovered}
            renderItem={renderAddress}
            keyExtractor={address => `${item.index}-${address.index}`}
            style={styles.addressList}
          />
        )}
      </View>
    )
  }

  const renderTransactionModal = () => {
    return (
      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        hardwareAccelerated={true}
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Transactions for</Text>
            <Text style={styles.modalAddress} numberOfLines={1} ellipsizeMode="middle">
              {selectedAddress}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.txList}>
            {selectedTxs.map((tx, index) => (
              <View key={tx.txid} style={styles.txItem}>
                <Text style={styles.txId}>TXID: {tx.txid}</Text>
                <Text style={styles.txDetail}>
                  Time: {new Date(tx.time * 1000).toLocaleString()}
                </Text>
                <Text style={styles.txDetail}>Confirmations: {tx.confirmations ?? 0}</Text>
                <Text style={styles.txDetail}>
                  Status: {tx.confirmations && tx.confirmations >= 6 ? 'Confirmed' : 'Pending'}
                </Text>

                <View style={styles.txDetails}>
                  <Text style={styles.txDetailHeader}>Inputs ({tx.vin.length})</Text>
                  {tx.vin.map((input, i) => (
                    <Text
                      key={i}
                      style={styles.txDetailItem}
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {input.txid}:{input.vout}
                    </Text>
                  ))}

                  <Text style={styles.txDetailHeader}>Outputs ({tx.vout.length})</Text>
                  {tx.vout.map((output, i) => (
                    <View key={i} style={styles.txOutput}>
                      <Text style={styles.txDetailItem} numberOfLines={1} ellipsizeMode="middle">
                        {output.scriptPubKey.address}
                      </Text>
                      <Text style={styles.txAmount}>{output.value} BTC</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {selectedTxs.length === 0 && <Text style={styles.noTxs}>No transactions found</Text>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    )
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Discovering accounts...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {discoveredAccounts.length === 0 ? (
        <Text style={styles.emptyState}>No accounts discovered yet</Text>
      ) : (
        <FlatList
          data={discoveredAccounts}
          renderItem={renderAccount}
          keyExtractor={item => `account-${item.index}`}
          style={styles.accountsList}
        />
      )}

      {renderTransactionModal()}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#555',
  },
  emptyState: {
    textAlign: 'center',
    fontSize: 16,
    color: '#555',
    marginTop: 24,
  },
  accountsList: {
    flex: 1,
  },
  accountContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#e0e0e0',
  },
  accountTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  accountSummary: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryText: {
    marginRight: 8,
    fontSize: 14,
    color: '#555',
  },
  expandCollapseText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  addressList: {
    maxHeight: 300,
  },
  addressItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  addressInfo: {
    flex: 1,
  },
  addressIndex: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  addressText: {
    fontSize: 12,
    color: '#555',
    marginVertical: 4,
  },
  txCount: {
    fontSize: 12,
    color: '#888',
  },
  viewButton: {
    backgroundColor: '#0066cc',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  viewButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
  },
  modalHeader: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalAddress: {
    fontSize: 14,
    color: '#555',
    marginBottom: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 8,
  },
  closeButtonText: {
    color: '#0066cc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  txList: {
    flex: 1,
  },
  txItem: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  txId: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  txDetail: {
    fontSize: 14,
    marginBottom: 4,
  },
  txDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  txDetailHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  txDetailItem: {
    fontSize: 12,
    color: '#555',
    marginBottom: 4,
  },
  txOutput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  txAmount: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  noTxs: {
    textAlign: 'center',
    fontSize: 16,
    color: '#555',
    marginTop: 24,
  },
})
