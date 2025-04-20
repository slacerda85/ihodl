import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useColorScheme } from 'react-native'
import colors from '@/shared/theme/colors'
import { useRouter } from 'expo-router'
import { alpha } from '@/shared/theme/utils'
import { useWallet } from './wallet-provider'
import ColdWalletIcon from './cold-wallet-icon'
import WalletTabIcon from './wallet-tab-icon'
import { saveSelectedWalletId } from '@/lib'

export default function ManageWallets() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const { wallets, selectedWalletId, setSelectedWalletId } = useWallet()

  function handleCreateWallet() {
    router.push('/wallet/create')
  }

  function handleImportWallet() {
    router.push('/wallet/import')
  }

  async function handleSelectWallet(walletId: string) {
    await saveSelectedWalletId(walletId)
    setSelectedWalletId(walletId)
    router.back()
  }

  return (
    <ScrollView style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
        <Text style={[styles.heading, isDark && styles.headingDark]}>Manage wallets</Text>
        <View style={styles.walletList}>
          {wallets.length > 0 ? (
            wallets.map(wallet => {
              // const btcBalance = wallet.transactions.reduce((acc, tx) => acc + tx.value, 0)
              const isSelected = wallet.walletId === selectedWalletId

              return (
                <TouchableOpacity
                  key={wallet.walletId}
                  style={[
                    styles.walletBox,
                    isDark && styles.walletBoxDark,
                    isSelected && styles.selectedWalletBox,
                    isDark && isSelected && styles.selectedWalletBoxDark,
                  ]}
                  onPress={() => handleSelectWallet(wallet.walletId)}
                >
                  <View style={styles.radioContainer}>
                    <View
                      style={[
                        styles.radioOuter,
                        isDark && styles.radioOuterDark,
                        isSelected && styles.radioOuterSelected,
                      ]}
                    >
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.walletHeader}>
                      {wallet.cold ? (
                        <ColdWalletIcon />
                      ) : (
                        <WalletTabIcon
                          color={isSelected ? colors.primary : colors.textSecondary.light}
                        />
                      )}
                      <View>
                        <Text style={[styles.walletName, isDark && styles.walletNameDark]}>
                          {wallet.walletName}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })
          ) : (
            <View style={[styles.walletBox, isDark && styles.walletBoxDark]}>
              <View style={styles.emptyWalletBox}>
                <Text style={[styles.subText, isDark && styles.subTextDark]}>No wallets found</Text>
              </View>
            </View>
          )}
        </View>
        <View style={{ gap: 8 }}>
          <TouchableOpacity onPress={handleCreateWallet} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Create New Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleImportWallet}
            style={[styles.secondaryButton, isDark && styles.secondaryButtonDark]}
          >
            <Text style={[styles.secondaryButtonText, isDark && styles.secondaryButtonTextDark]}>
              Import Wallet
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerDark: {
    backgroundColor: colors.background.dark,
  },
  contentWrapper: {
    paddingHorizontal: 24,
    gap: 24,
  },
  contentWrapperDark: {
    // No additional styles needed, inherits from containerDark
  },
  walletList: {
    gap: 8,
  },
  walletBox: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletBoxDark: {
    backgroundColor: alpha(colors.white, 0.1),
  },
  selectedWalletBox: {
    backgroundColor: alpha(colors.primary, 0.15),
    // borderColor: alpha(colors.primary, 0.2),
    // borderWidth: 1,
  },
  selectedWalletBoxDark: {
    backgroundColor: alpha(colors.primary, 0.2),
    // borderColor: alpha(colors.primary, 0.2),
    // borderWidth: 1,
  },
  radioContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuter: {
    height: 20,
    width: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textSecondary.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterDark: {
    borderColor: colors.textSecondary.dark,
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    height: 10,
    width: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  detailsButton: {
    padding: 4,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyWalletBox: {
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  walletName: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  walletNameDark: {
    color: colors.text.dark,
  },
  walletBalance: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
  },
  walletBalanceDark: {
    color: colors.text.dark,
  },
  walletType: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary.light,
  },
  walletTypeDark: {
    color: colors.textSecondary.dark,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: 'black',
  },
  headingDark: {
    color: 'white',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 16,
  },
  secondaryButton: {
    backgroundColor: colors.black,
    borderRadius: 16,
    padding: 16,
  },
  secondaryButtonDark: {
    backgroundColor: colors.background.light,
  },
  primaryButtonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '600',
  },
  secondaryButtonTextDark: {
    color: colors.black,
  },
  subText: {
    color: colors.textSecondary.light,
  },
  subTextDark: {
    color: colors.textSecondary.dark,
  },
})
