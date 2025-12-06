import { useState } from 'react'
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
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import QRCode from '@/ui/components/QRCode'
import Button from '@/ui/components/Button'
import {
  useIsDark,
  useAddressLoading,
  useNextAddresses,
  useAddressesByType,
} from '@/ui/features/app-provider'

export default function Receive() {
  const isDark = useIsDark()
  // const { loading, usedChangeAddresses, usedReceivingAddresses, nextReceiveAddress } = useAddress()
  const loading = useAddressLoading()
  const { receive: nextReceiveAddress } = useNextAddresses()
  const usedChangeAddresses = useAddressesByType('change')
  const usedReceivingAddresses = useAddressesByType('receiving')

  const [showAddressDetails, setShowAddressDetails] = useState(false)
  const [activeTab, setActiveTab] = useState<'receiving' | 'change'>('receiving')

  // Handle share address
  const handleShareAddress = async () => {
    if (!nextReceiveAddress) {
      Alert.alert('Error', 'Please select an address first')
      return
    }

    try {
      await Share.share({
        message: `My Bitcoin address: ${nextReceiveAddress}`,
        url: `bitcoin:${nextReceiveAddress}`,
      })
    } catch (error) {
      console.error('Error sharing address:', error)
    }
  }

  // Handle copy address
  const handleCopyAddress = async () => {
    if (!nextReceiveAddress) {
      Alert.alert('Error', 'Please select an address first')
      return
    }

    try {
      await Clipboard.setStringAsync(nextReceiveAddress)
      Alert.alert('Copied!', 'Address copied to clipboard')
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      Alert.alert('Error', 'Failed to copy address to clipboard')
    }
  }

  return (
    <View>
      <ScrollView style={[styles.scrollView, isDark && styles.scrollViewDark]}>
        <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
          {/* Loading State */}
          {loading ? (
            <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
              <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                Loading Addresses
              </Text>
              <View style={styles.qrContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                {loading && (
                  <Text style={[styles.subtitle, isDark && styles.subtitleDark, { marginTop: 16 }]}>
                    {loading}
                  </Text>
                )}
              </View>
            </View>
          ) : (
            <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
              <View style={styles.qrContainer}>
                <QRCode
                  value={`${nextReceiveAddress}`}
                  size={300}
                  color={isDark ? colors.text.dark : colors.text.light}
                  backgroundColor="transparent"
                />
              </View>
              {/* Exibição do endereço */}
              <Text style={[styles.addressText, isDark && styles.addressTextDark]}>
                {nextReceiveAddress}
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
                  /* tintColor={
                    isDark
                      ? alpha(colors.background.light, 0.05)
                      : alpha(colors.background.dark, 0.03)
                  } */
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
                  // tintColor={isDark ? alpha(colors.white, 0.05) : alpha(colors.black, 0.03)}
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
                onPress={() => setShowAddressDetails(true)}
              >
                View Used Addresses ({usedReceivingAddresses.length + usedChangeAddresses.length})
              </Button>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Used Addresses Modal */}
      <Modal
        visible={showAddressDetails}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddressDetails(false)}
      >
        <View style={[styles.modalContainer, isDark && styles.modalContainerDark]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
              Used Addresses ({usedReceivingAddresses.length + usedChangeAddresses.length})
            </Text>
            {/* <IconButton
              icon={
                <IconSymbol
                  name="xmark"
                  size={24}
                  color={isDark ? colors.text.dark : colors.text.light}
                />
              }
              variant="solid"
              backgroundColor="transparent"
              onPress={() => setShowAddressDetails(false)}
            /> */}
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
            data={activeTab === 'receiving' ? usedReceivingAddresses : usedChangeAddresses}
            keyExtractor={(item, index) => item.address + index}
            renderItem={({ item }) => (
              <View style={[styles.usedAddressItem, isDark && styles.usedAddressItemDark]}>
                <Text style={[styles.usedAddressIndex, isDark && styles.usedAddressIndexDark]}>
                  {item.derivationPath.addressIndex + 1}
                </Text>

                <Text style={[styles.usedAddressText, isDark && styles.usedAddressTextDark]}>
                  {item.address}
                </Text>

                <Text>{`${item.txs.length} txs`}</Text>
              </View>
            )}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
    </View>
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
    fontSize: 20,
    fontWeight: '400',
    fontFamily: 'ui-monospace',
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  addressTextDark: {
    color: colors.textSecondary.dark,
  },

  // Modal
  modalContainer: {
    // flex: 1,
    backgroundColor: colors.white,
  },
  modalContainerDark: {
    backgroundColor: colors.black,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: alpha(colors.textSecondary.light, 0.9),
  },
  modalTitleDark: {
    color: alpha(colors.textSecondary.dark, 0.9),
  },
  modalContent: {
    padding: 16,
    gap: 16,
  },

  // Used addresses
  usedAddressItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 32,
    backgroundColor: alpha(colors.black, 0.03),
    flexDirection: 'row',
    // justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
  },
  usedAddressItemDark: {
    backgroundColor: alpha(colors.white, 0.05),
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
    flex: 1,
    fontSize: 14,
    fontFamily: 'ui-monospace',
    color: colors.text.light,
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
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 16,
    backgroundColor: alpha(colors.black, 0.05),
    borderRadius: 32,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 32,
    alignItems: 'center',
  },
  tabActive: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    backgroundColor: colors.white,
  },
  tabActiveDark: {
    backgroundColor: alpha(colors.background.light, 0.1),
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary.light,
  },
  tabTextDark: {
    color: colors.textSecondary.dark,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
})
