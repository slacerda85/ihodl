import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Share,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'

import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/IconSymbol/IconSymbol'
import QRCode from '@/ui/QRCode'
import Button from '@/ui/Button'
import { IconButton } from '@/ui/Button'

import { useWallet } from '@/features/wallet'
import { useSettings } from '@/features/settings'

import { AddressDetails } from '@/lib/address'
// import { useTransactions } from '@/features/transactions'
import { useAccount } from '@/features/account/AccountProvider'

// Address generation utilities - separated for better organization

export default function Receive() {
  const { isDark } = useSettings()
  const { accounts } = useAccount()
  const walletAccounts = accounts.filter(acc => acc.walletId === activeWalletId)

  // const { history } = useTransactions()

  const { activeWalletId } = useWallet()
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [showAddressDetailses, setShowAddressDetailses] = useState(false)
  const [activeTab, setActiveTab] = useState<'receiving' | 'change'>('receiving')
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string>('')

  // Address data state - separate from useMemo for better performance
  // const [_availableAddresses, setAvailableAddresses] = useState<string[]>(mockAddresses)
  const [usedReceivingAddresses, setUsedReceivingAddresses] = useState<AddressDetails[]>([])
  const [usedChangeAddresses, setUsedChangeAddresses] = useState<AddressDetails[]>([])
  const [nextUnusedAddress, setNextUnusedAddress] = useState<string>('')

  // Get active wallet
  // const activeWallet = wallets.find(w => w.walletId === activeWalletId)

  // Generate addresses asynchronously when wallet changes
  useEffect(() => {
    if (!activeWalletId || walletAccounts.length === 0) {
      setUsedReceivingAddresses([])
      setUsedChangeAddresses([])
      setNextUnusedAddress('')
      setSelectedAddress('')
      setIsLoadingAddresses(false)
      return
    }

    const generateAddresses = async () => {
      setIsLoadingAddresses(true)
      setLoadingMessage('Generating addresses...')
      try {
        setNextUnusedAddress(walletAccounts[0].address)
        setSelectedAddress(walletAccounts[0].address)
        setIsLoadingAddresses(false)
        setLoadingMessage('')
      } catch (error) {
        console.error('Error generating addresses:', error)
        setIsLoadingAddresses(false)
        setLoadingMessage('Failed to generate addresses')
      }
    }

    generateAddresses()
  }, [activeWalletId, walletAccounts.length])

  // Handle share address
  const handleShareAddress = async () => {
    if (!selectedAddress) {
      Alert.alert('Error', 'Please select an address first')
      return
    }

    try {
      await Share.share({
        message: `My Bitcoin address: ${selectedAddress}`,
        url: `bitcoin:${selectedAddress}`,
      })
    } catch (error) {
      console.error('Error sharing address:', error)
    }
  }

  // Handle copy address
  const handleCopyAddress = async () => {
    if (!selectedAddress) {
      Alert.alert('Error', 'Please select an address first')
      return
    }

    try {
      await Clipboard.setStringAsync(selectedAddress)
      Alert.alert('Copied!', 'Address copied to clipboard')
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      Alert.alert('Error', 'Failed to copy address to clipboard')
    }
  }

  // Generate new address (placeholder)
  const handleGenerateNewAddress = () => {
    Alert.alert(
      'Generate New Address',
      'This would generate a new receiving address for your wallet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: () => {
            // In a real implementation, this would call wallet.generateAddress()
            Alert.alert('Success', 'New address generated (placeholder)')
          },
        },
      ],
    )
  }

  const calcScreenWidth = () => {
    const screenWidth = window.innerWidth
    return screenWidth - 32 // subtract padding
  }

  useEffect(() => {
    console.log(nextUnusedAddress)
  }, [nextUnusedAddress])

  return (
    <>
      <ScrollView style={[styles.scrollView, isDark && styles.scrollViewDark]}>
        <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
          {/* Loading State */}
          {isLoadingAddresses && (
            <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
              <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                Loading Addresses
              </Text>
              <View style={styles.qrContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                {loadingMessage && (
                  <Text style={[styles.subtitle, isDark && styles.subtitleDark, { marginTop: 16 }]}>
                    {loadingMessage}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Address Display with QR Code Section */}
          {selectedAddress && activeWalletId && !isLoadingAddresses && (
            <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
              <View style={styles.qrContainer}>
                <QRCode
                  value={`${selectedAddress}`}
                  size={
                    // calculate screen width minus padding
                    calcScreenWidth() < 300 ? calcScreenWidth() : 300
                  }
                  color={isDark ? colors.text.dark : colors.text.light}
                  backgroundColor="transparent"
                />
              </View>
              {/* Exibição do endereço */}
              <Text
              // style={[styles.addressText, isDark && styles.addressTextDark]}
              // numberOfLines={10}
              >
                {selectedAddress}
              </Text>
              <View
                style={{
                  // backgroundColor: 'red',
                  flexDirection: 'row',
                  gap: 24,
                }}
              >
                <Button
                  // variant="solid"
                  tintColor={
                    isDark
                      ? alpha(colors.background.light, 0.05)
                      : alpha(colors.background.dark, 0.03)
                  }
                  style={{ flex: 1 }}
                  color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  startIcon={
                    <IconSymbol
                      name="doc.on.doc"
                      size={20}
                      color={colors.textSecondary[isDark ? 'dark' : 'light']}
                    />
                  }
                  onPress={handleCopyAddress}
                >
                  Copy
                </Button>

                <Button
                  style={{ flex: 1 }}
                  // variant="solid"
                  tintColor={isDark ? alpha(colors.white, 0.05) : alpha(colors.black, 0.03)}
                  color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  startIcon={
                    <IconSymbol
                      name="square.and.arrow.up"
                      size={20}
                      color={colors.textSecondary[isDark ? 'dark' : 'light']}
                    />
                  }
                  onPress={handleShareAddress}
                >
                  Share
                </Button>
              </View>
              {/* </View> */}
              <Button
                // variant="solid"
                // backgroundColor={isDark ? alpha(colors.white, 0.05) : alpha(colors.black, 0.03)}
                color={colors.textSecondary[isDark ? 'dark' : 'light']}
                startIcon={
                  <IconSymbol
                    name="list.bullet"
                    size={20}
                    color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  />
                }
                onPress={() => setShowAddressDetailses(true)}
              >
                View Used Addresses ({usedReceivingAddresses.length + usedChangeAddresses.length})
              </Button>
              <Button
                // variant="solid"
                // backgroundColor={alpha(colors.primary, 0.7)}
                color={colors.textSecondary[isDark ? 'dark' : 'light']}
                startIcon={
                  <IconSymbol
                    name="plus"
                    size={20}
                    color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  />
                }
                onPress={handleGenerateNewAddress}
              >
                Generate New Address
              </Button>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Used Addresses Modal */}
      <Modal
        visible={showAddressDetailses}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddressDetailses(false)}
      >
        <View style={[styles.modalContainer, isDark && styles.modalContainerDark]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
              Used Addresses ({usedReceivingAddresses.length + usedChangeAddresses.length})
            </Text>
            <IconButton
              icon={
                <IconSymbol
                  name="xmark"
                  size={24}
                  color={isDark ? colors.text.dark : colors.text.light}
                />
              }
              variant="solid"
              backgroundColor="transparent"
              onPress={() => setShowAddressDetailses(false)}
            />
          </View>

          {/* Tabs */}
          <View style={styles.tabContainer}>
            <Pressable
              style={[
                styles.tab,
                activeTab === 'receiving' && styles.tabActive,
                activeTab === 'receiving' && isDark && styles.tabActiveDark,
              ]}
              onPress={() => setActiveTab('receiving')}
            >
              <Text
                style={[
                  styles.tabText,
                  isDark && styles.tabTextDark,
                  activeTab === 'receiving' && styles.tabTextActive,
                ]}
              >
                Receiving ({usedReceivingAddresses.length})
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.tab,
                activeTab === 'change' && styles.tabActive,
                activeTab === 'change' && isDark && styles.tabActiveDark,
              ]}
              onPress={() => setActiveTab('change')}
            >
              <Text
                style={[
                  styles.tabText,
                  isDark && styles.tabTextDark,
                  activeTab === 'change' && styles.tabTextActive,
                ]}
              >
                Change ({usedChangeAddresses.length})
              </Text>
            </Pressable>
          </View>

          <FlatList
            key={activeTab}
            data={(activeTab === 'receiving' ? usedReceivingAddresses : usedChangeAddresses) as any}
            keyExtractor={(item, index) => item.address + index}
            renderItem={({ item }) => (
              <View style={[styles.usedAddressItem, isDark && styles.usedAddressItemDark]}>
                <View style={styles.usedAddressHeader}>
                  <Text style={[styles.usedAddressIndex, isDark && styles.usedAddressIndexDark]}>
                    Address {item.index + 1}
                  </Text>
                  <Text style={[styles.transactionCount, isDark && styles.transactionCountDark]}>
                    {item.transactions.length} transaction
                    {item.transactions.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={[styles.usedAddressText, isDark && styles.usedAddressTextDark]}>
                  {item.address}
                </Text>
                <View style={styles.transactionList}>
                  {item.transactions.slice(0, 3).map((tx: any, txIndex: number) => (
                    <Text
                      key={tx.txid}
                      style={[styles.transactionId, isDark && styles.transactionIdDark]}
                    >
                      {tx.txid} ({tx.confirmations} conf.)
                    </Text>
                  ))}
                  {item.transactions.length > 3 && (
                    <Text style={[styles.moreTransactions, isDark && styles.moreTransactionsDark]}>
                      +{item.transactions.length - 3} more transactions
                    </Text>
                  )}
                </View>
              </View>
            )}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  // Scroll and content
  scrollView: {},
  scrollViewDark: {},
  contentWrapper: {
    padding: 24,
    gap: 24,
  },
  contentWrapperDark: {},

  // Section
  sectionBox: {
    gap: 24,
  },
  sectionBoxDark: {},
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  subtitleDark: {
    color: colors.textSecondary.dark,
  },

  // QR
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Address
  addressText: {
    paddingHorizontal: 12,
    fontSize: 16,
    fontFamily: 'monospace',
    color: colors.text.light,
    textAlign: 'center',
  },
  addressTextDark: {
    color: colors.text.dark,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  modalContainerDark: {
    backgroundColor: colors.black,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.black, 0.1),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  modalTitleDark: {
    color: colors.text.dark,
  },
  modalContent: {
    padding: 16,
    gap: 16,
  },

  // Used addresses
  usedAddressItem: {
    padding: 16,
    borderRadius: 32,
    backgroundColor: alpha(colors.black, 0.03),
  },
  usedAddressItemDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  usedAddressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  usedAddressIndex: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
  },
  usedAddressIndexDark: {
    color: colors.text.dark,
  },
  transactionCount: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  transactionCountDark: {
    color: colors.textSecondary.dark,
  },
  usedAddressText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.light,
    marginBottom: 12,
  },
  usedAddressTextDark: {
    color: colors.text.dark,
  },
  transactionList: {
    gap: 4,
  },
  transactionId: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.textSecondary.light,
  },
  transactionIdDark: {
    color: colors.textSecondary.dark,
  },
  moreTransactions: {
    fontSize: 12,
    color: colors.primary,
    fontStyle: 'italic',
  },
  moreTransactionsDark: {
    color: colors.primary,
  },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.black, 0.1),
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 32,
    marginHorizontal: 4,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabActiveDark: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary.light,
  },
  tabTextDark: {
    color: colors.textSecondary.dark,
  },
  tabTextActive: {
    color: colors.white,
  },
})
