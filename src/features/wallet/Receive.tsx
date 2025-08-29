import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  useColorScheme,
  Alert,
  Share,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/icon-symbol'
import useStorage from '../storage'
import {
  createRootExtendedKey,
  fromMnemonic,
  createHardenedIndex,
  deriveChildPrivateKey,
  splitRootExtendedKey,
  createPublicKey,
} from '@/lib/key'
import { createSegwitAddress } from '@/lib/address'

// Mock data for demonstration
const mockAddresses = [
  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297',
]

// Types for address data
interface UsedAddress {
  address: string
  index: number
  type: 'receiving' | 'change'
  transactions: any[]
}

// Address generation utilities - separated for better organization
const generateAddressBatch = (
  extendedKey: any,
  startIndex: number,
  count: number,
  usedAddressSet: Set<string>,
  walletCache: any,
  type: 'receiving' | 'change',
): { addresses: string[]; usedAddresses: UsedAddress[]; nextUnused: string | null } => {
  const addresses: string[] = []
  const usedAddresses: UsedAddress[] = []
  let nextUnused: string | null = null

  for (let i = startIndex; i < startIndex + count; i++) {
    try {
      const addressIndexExtendedKey = deriveChildPrivateKey(extendedKey, i)
      const { privateKey } = splitRootExtendedKey(addressIndexExtendedKey)
      const publicKey = createPublicKey(privateKey)
      const address = createSegwitAddress(publicKey)

      addresses.push(address)

      if (usedAddressSet.has(address)) {
        usedAddresses.push({
          address,
          index: i,
          type,
          transactions:
            walletCache?.transactions.filter((tx: any) =>
              tx.vout.some((vout: any) => vout.scriptPubKey.address === address),
            ) || [],
        })
      } else if (!nextUnused) {
        nextUnused = address
      }
    } catch (error) {
      console.warn(`Error generating ${type} address at index ${i}:`, error)
    }
  }

  return { addresses, usedAddresses, nextUnused }
}

const generateWalletAddressesAsync = async (
  wallet: any,
  tx: any,
): Promise<{
  availableAddresses: string[]
  usedReceivingAddresses: UsedAddress[]
  usedChangeAddresses: UsedAddress[]
  nextUnusedAddress: string
}> => {
  if (!wallet) {
    return {
      availableAddresses: mockAddresses,
      usedReceivingAddresses: [],
      usedChangeAddresses: [],
      nextUnusedAddress: mockAddresses[0],
    }
  }

  try {
    // Allow UI to render first by yielding control
    await new Promise(resolve => setTimeout(resolve, 0))

    const rootExtendedKey = createRootExtendedKey(fromMnemonic(wallet.seedPhrase))
    const walletCache = tx.walletCaches.find((cache: any) => cache.walletId === wallet.walletId)
    const usedAddressSet = new Set<string>(walletCache?.addresses || [])

    // Generate derivation path components
    const purposeIndex = createHardenedIndex(84) // Native SegWit
    const purposeExtendedKey = deriveChildPrivateKey(rootExtendedKey, purposeIndex)

    const coinTypeIndex = createHardenedIndex(0) // Bitcoin
    const coinTypeExtendedKey = deriveChildPrivateKey(purposeExtendedKey, coinTypeIndex)

    const accountIndex = createHardenedIndex(0) // Default account
    const accountExtendedKey = deriveChildPrivateKey(coinTypeExtendedKey, accountIndex)

    // Receiving addresses (change 0)
    const receivingExtendedKey = deriveChildPrivateKey(accountExtendedKey, 0)
    // Change addresses (change 1)
    const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, 1)

    // Generate addresses in smaller batches to prevent UI blocking
    const batchSize = 5
    const totalAddresses = 20

    let allAddresses: string[] = []
    let usedReceiving: UsedAddress[] = []
    let usedChange: UsedAddress[] = []
    let nextUnused: string | null = null

    // Process receiving addresses in batches
    for (let batch = 0; batch < totalAddresses / batchSize; batch++) {
      const startIndex = batch * batchSize
      const {
        addresses,
        usedAddresses,
        nextUnused: batchNextUnused,
      } = generateAddressBatch(
        receivingExtendedKey,
        startIndex,
        batchSize,
        usedAddressSet,
        walletCache,
        'receiving',
      )

      allAddresses.push(...addresses)
      usedReceiving.push(...usedAddresses)

      if (!nextUnused && batchNextUnused) {
        nextUnused = batchNextUnused
      }

      // Yield control back to the event loop between batches
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    // Process change addresses in batches
    for (let batch = 0; batch < totalAddresses / batchSize; batch++) {
      const startIndex = batch * batchSize
      const { usedAddresses } = generateAddressBatch(
        changeExtendedKey,
        startIndex,
        batchSize,
        usedAddressSet,
        walletCache,
        'change',
      )

      usedChange.push(...usedAddresses)

      // Yield control back to the event loop between batches
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    return {
      availableAddresses: allAddresses,
      usedReceivingAddresses: usedReceiving,
      usedChangeAddresses: usedChange,
      nextUnusedAddress: nextUnused || allAddresses[0] || mockAddresses[0],
    }
  } catch (error) {
    console.error('Error generating wallet addresses:', error)
    return {
      availableAddresses: mockAddresses,
      usedReceivingAddresses: [],
      usedChangeAddresses: [],
      nextUnusedAddress: mockAddresses[0],
    }
  }
}

export default function Receive() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const { wallets, activeWalletId, tx } = useStorage()
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [showUsedAddresses, setShowUsedAddresses] = useState(false)
  const [activeTab, setActiveTab] = useState<'receiving' | 'change'>('receiving')
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)

  // Address data state - separate from useMemo for better performance
  const [availableAddresses, setAvailableAddresses] = useState<string[]>(mockAddresses)
  const [usedReceivingAddresses, setUsedReceivingAddresses] = useState<UsedAddress[]>([])
  const [usedChangeAddresses, setUsedChangeAddresses] = useState<UsedAddress[]>([])
  const [nextUnusedAddress, setNextUnusedAddress] = useState<string>(mockAddresses[0])

  // Get active wallet
  const activeWallet = wallets.find(w => w.walletId === activeWalletId)

  // Refs for managing async operations
  const isMountedRef = useRef(true)
  const generationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Generate addresses asynchronously when wallet changes
  useEffect(() => {
    if (!activeWallet) {
      setAvailableAddresses(mockAddresses)
      setUsedReceivingAddresses([])
      setUsedChangeAddresses([])
      setNextUnusedAddress(mockAddresses[0])
      setIsLoadingAddresses(false)
      return
    }

    // Clear any pending generation
    if (generationTimeoutRef.current) {
      clearTimeout(generationTimeoutRef.current)
    }

    setIsLoadingAddresses(true)

    // Use setTimeout with low priority to move heavy computation off main thread
    generationTimeoutRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return

      try {
        const result = await generateWalletAddressesAsync(activeWallet, tx)

        if (!isMountedRef.current) return

        setAvailableAddresses(result.availableAddresses)
        setUsedReceivingAddresses(result.usedReceivingAddresses)
        setUsedChangeAddresses(result.usedChangeAddresses)
        setNextUnusedAddress(result.nextUnusedAddress)
        setIsLoadingAddresses(false)
      } catch (error) {
        if (!isMountedRef.current) return
        console.error('Failed to generate addresses:', error)
        setIsLoadingAddresses(false)
      }
    }, 100) // Small delay to ensure UI renders first

    return () => {
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current)
      }
    }
  }, [activeWallet, tx, activeWalletId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current)
      }
    }
  }, [])

  // Set selected address to next unused address when it changes
  useEffect(() => {
    if (nextUnusedAddress && !selectedAddress) {
      setSelectedAddress(nextUnusedAddress)
    }
  }, [nextUnusedAddress, selectedAddress])

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
  const handleCopyAddress = () => {
    if (!selectedAddress) {
      Alert.alert('Error', 'Please select an address first')
      return
    }

    // In a real implementation, you would use Clipboard.setString()
    Alert.alert('Copied!', 'Address copied to clipboard')
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

  return (
    <>
      <ScrollView style={[styles.scrollView, isDark && styles.scrollViewDark]}>
        <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
          {/* Header Section */}
          <View
            style={[styles.sectionBox, styles.sectionBoxFirst, isDark && styles.sectionBoxDark]}
          >
            <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
              {activeWallet ? `Wallet: ${activeWallet.walletName}` : 'No wallet selected'}
            </Text>
          </View>

          {/* QR Code Section */}
          {selectedAddress && activeWallet && (
            <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
              <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>QR Code</Text>
              <View style={[styles.qrContainer, isDark && styles.qrContainerDark]}>
                <View style={styles.qrPlaceholder}>
                  {isLoadingAddresses ? (
                    <ActivityIndicator size="large" color={colors.primary} />
                  ) : (
                    <QRCode
                      value={`${selectedAddress}`}
                      size={180}
                      color={isDark ? colors.text.dark : colors.text.light}
                      backgroundColor="transparent"
                    />
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Address Display Section */}
          {selectedAddress && activeWallet && (
            <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
              <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Address</Text>
              <Text style={[styles.addressText, isDark && styles.addressTextDark]}>
                {selectedAddress}
              </Text>
            </View>
          )}

          {/* Used Addresses Section */}
          {(usedReceivingAddresses.length > 0 || usedChangeAddresses.length > 0) && (
            <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
              <Pressable
                style={[
                  styles.button,
                  styles.secondaryButton,
                  isDark && styles.secondaryButtonDark,
                ]}
                onPress={() => setShowUsedAddresses(true)}
              >
                <IconSymbol name="list.bullet" size={20} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>
                  View Used Addresses ({usedReceivingAddresses.length + usedChangeAddresses.length})
                </Text>
              </Pressable>
            </View>
          )}

          {/* Action Buttons Section */}
          <View style={[styles.sectionBox, styles.sectionBoxLast, isDark && styles.sectionBoxDark]}>
            <View style={styles.buttonRow}>
              <Pressable
                style={[
                  styles.button,
                  styles.secondaryButton,
                  isDark && styles.secondaryButtonDark,
                ]}
                onPress={handleCopyAddress}
              >
                <IconSymbol name="doc.on.doc" size={20} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>Copy</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.button,
                  styles.secondaryButton,
                  isDark && styles.secondaryButtonDark,
                ]}
                onPress={handleShareAddress}
              >
                <IconSymbol name="square.and.arrow.up" size={20} color={colors.primary} />
                <Text style={styles.secondaryButtonText}>Share</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={handleGenerateNewAddress}
            >
              <IconSymbol name="plus" size={20} color={colors.primary} />
              <Text style={styles.primaryButtonText}>Generate New Address</Text>
            </Pressable>
          </View>

          {/* Info Section */}
          <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
            <IconSymbol
              name="info.circle.fill"
              size={20}
              color={colors.info}
              style={styles.infoIcon}
            />
            <View style={styles.infoContent}>
              <Text style={[styles.infoTitle, isDark && styles.infoTitleDark]}>Security Tips</Text>
              <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
                • Always verify the address before sending{'\n'}• Use a fresh address for each
                transaction{'\n'}• Keep your wallet secure and backed up
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Used Addresses Modal */}
      <Modal
        visible={showUsedAddresses}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowUsedAddresses(false)}
      >
        <View style={[styles.modalContainer, isDark && styles.modalContainerDark]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
              Used Addresses ({usedReceivingAddresses.length + usedChangeAddresses.length})
            </Text>
            <Pressable style={styles.closeButton} onPress={() => setShowUsedAddresses(false)}>
              <IconSymbol name="xmark" size={24} color={colors.text.light} />
            </Pressable>
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
            data={(activeTab === 'receiving' ? usedReceivingAddresses : usedChangeAddresses) as any}
            keyExtractor={item => item.address}
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
                      {tx.txid.substring(0, 16)}... ({tx.confirmations} conf.)
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
  scrollView: {
    flex: 1,
  },
  scrollViewDark: {
    // No additional styles needed
  },
  contentWrapper: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 24,
  },
  contentWrapperDark: {
    // No additional styles needed
  },
  sectionBox: {
    backgroundColor: colors.white,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    gap: 16,
  },
  sectionBoxFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sectionBoxLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  sectionBoxDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
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
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 12,
    // backgroundColor: alpha(colors.black, 0.03),
  },
  qrContainerDark: {
    // backgroundColor: alpha(colors.white, 0.05),
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
  },
  qrText: {
    fontSize: 12,
    color: colors.textSecondary.light,
    textAlign: 'center',
    marginTop: 16,
  },
  qrTextDark: {
    color: colors.textSecondary.dark,
  },
  addressContainer: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: alpha(colors.black, 0.03),
  },
  addressContainerDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  addressText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.light,
    textAlign: 'center',
  },
  addressTextDark: {
    color: colors.text.dark,
  },
  addressList: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  addressCard: {
    width: 160,
    padding: 16,
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: alpha(colors.black, 0.03),
    alignItems: 'center',
  },
  addressCardDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  addressCardActive: {
    backgroundColor: colors.primary,
  },
  addressCardActiveDark: {
    backgroundColor: colors.primary,
  },
  addressCardText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 4,
  },
  addressCardTextDark: {
    color: colors.text.dark,
  },
  addressCardTextActive: {
    color: colors.white,
  },
  addressCardAddress: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.textSecondary.light,
  },
  addressCardAddressDark: {
    color: colors.textSecondary.dark,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonDark: {
    borderColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '500',
    fontSize: 16,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: '500',
    fontSize: 16,
  },
  infoBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    backgroundColor: alpha(colors.info, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.info, 0.2),
  },
  infoBoxDark: {
    backgroundColor: alpha(colors.info, 0.1),
    borderColor: alpha(colors.info, 0.2),
  },
  infoIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 4,
  },
  infoTitleDark: {
    color: colors.text.dark,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    lineHeight: 20,
  },
  infoTextDark: {
    color: colors.textSecondary.dark,
  },
  // Modal styles
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
  closeButton: {
    padding: 8,
  },
  modalContent: {
    padding: 16,
    gap: 16,
  },
  usedAddressItem: {
    padding: 16,
    borderRadius: 12,
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
  // Tab styles
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
    borderRadius: 8,
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
