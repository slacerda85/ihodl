import React, { Fragment, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useColorScheme } from 'react-native'
import colors, { rbgToHex, rgbaToHex } from '@/shared/theme/colors'
import { useRouter } from 'expo-router'
import { alpha } from '@/shared/theme/utils'
import { useWallet } from './WalletProvider'
import ColdWalletIcon from './cold-wallet-icon'
import WalletTabIcon from './WalletTabIcon'
import Divider from '@/shared/ui/Divider'
import CreateWalletIcon from './CreateWalletIcon'
import ImportWalletIcon from './ImportWalletIcon'

export default function ManageWallets() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const { wallets, selectedWalletId, selectWalletId, loading } = useWallet()
  const [loadingWalletId, setLoadingWalletId] = useState<string | null>(null)

  function handleCreateWallet() {
    router.push('/wallet/create')
  }

  function handleImportWallet() {
    router.push('/wallet/import')
  }

  async function handleSelectWallet(walletId: string) {
    try {
      setLoadingWalletId(walletId)
      // Assuming selectWalletId is or can be modified to return a Promise
      await selectWalletId(walletId)
      router.dismiss()
    } catch (error) {
      console.error('Error selecting wallet:', error)
      // Handle error if needed - you could add error state if required
    } finally {
      setLoadingWalletId(null)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
        <View style={styles.walletList}>
          {loading ? (
            <View style={[styles.walletBox, isDark && styles.walletBoxDark]}>
              <View style={styles.emptyWalletBox}>
                <Text style={[styles.subText, isDark && styles.subTextDark]}>
                  Loading wallets...
                </Text>
              </View>
            </View>
          ) : wallets === undefined ? (
            <View style={[styles.walletBox, isDark && styles.walletBoxDark]}>
              <View style={styles.emptyWalletBox}>
                <Text style={[styles.subText, isDark && styles.subTextDark]}>No wallets </Text>
              </View>
            </View>
          ) : wallets.length > 0 ? (
            wallets.map((wallet, index) => {
              const isSelected = wallet.walletId === selectedWalletId
              const first = index === 0
              const last = index === wallets.length - 1

              return (
                <Fragment key={index}>
                  <TouchableOpacity
                    key={wallet.walletId}
                    style={[
                      styles.walletBox,
                      first && styles.walletBoxFirst,
                      last && styles.walletBoxLast,
                      isDark && styles.walletBoxDark,
                      loading && styles.walletBoxLoading,
                      isSelected && styles.selectedWalletBox,
                      isDark && isSelected && styles.selectedWalletBoxDark,
                      wallet.walletId === loadingWalletId && styles.walletBoxLoading,
                    ]}
                    onPress={() => handleSelectWallet(wallet.walletId)}
                    disabled={loadingWalletId !== null} // Disable all selections during loading
                  >
                    {/* <View style={styles.radioContainer}>
                    <View
                      style={[
                        styles.radioOuter,
                        isDark && styles.radioOuterDark,
                        isSelected && styles.radioOuterSelected,
                      ]}
                    >
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                  </View> */}

                    <View style={{ flex: 1 }}>
                      <View style={styles.walletHeader}>
                        {wallet.walletId === loadingWalletId ? (
                          <ActivityIndicator size={24} color={colors.primary} />
                        ) : wallet.cold ? (
                          <ColdWalletIcon />
                        ) : (
                          <WalletTabIcon
                            color={isSelected ? colors.primary : colors.textSecondary.light}
                            filled={isSelected}
                          />
                        )}
                        <Text style={[styles.walletName, isDark && styles.walletNameDark]}>
                          {wallet.walletName}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  {!last ? (
                    <Divider
                      orientation="horizontal"
                      color={isDark ? colors.border.dark : colors.border.light}
                    />
                  ) : null}
                </Fragment>
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
        <Divider
          orientation="horizontal"
          color={isDark ? colors.border.dark : colors.border.light}
        />

        <View>
          <TouchableOpacity
            onPress={handleCreateWallet}
            style={[styles.walletBox, styles.walletBoxFirst, isDark && styles.walletBoxDark]}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CreateWalletIcon size={24} color={colors.primary} />
              <Text style={styles.actionButton}>Create New Wallet</Text>
            </View>
          </TouchableOpacity>
          <Divider
            orientation="horizontal"
            color={isDark ? colors.border.dark : colors.border.light}
          />

          <TouchableOpacity
            onPress={handleImportWallet}
            style={[
              styles.walletBox,
              styles.walletBoxLast,
              // styles.secondaryButton,
              isDark && styles.walletBoxDark,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ImportWalletIcon size={24} color={colors.primary} />

              <Text style={styles.actionButton}>Import Wallet</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 24,
    flex: 1,
  },
  contentWrapper: {
    paddingHorizontal: 24,
    gap: 24,
  },
  contentWrapperDark: {
    // No additional styles needed, inherits from containerDark
  },
  walletList: {
    // gap: 1,
  },
  walletBox: {
    backgroundColor: colors.modal.light,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletBoxFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  walletBoxLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  walletBoxDark: {
    backgroundColor: alpha(colors.modal.light, 0.05),
  },
  selectedWalletBox: {
    backgroundColor: colors.border.light, // alpha(colors.primary, 0.1),
    // borderColor: alpha(colors.primary, 0.2),
    // borderWidth: 1,
  },
  selectedWalletBoxDark: {
    backgroundColor: colors.border.dark, // alpha(colors.modal.light, 0.12),
    // borderColor: alpha(colors.primary, 0.2),
    // borderWidth: 1,
  },
  walletBoxLoading: {
    opacity: 0.5,
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
    fontWeight: '500',
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
  actionButton: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
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
