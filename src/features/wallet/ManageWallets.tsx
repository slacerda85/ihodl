import React, { Fragment, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useColorScheme } from 'react-native'
import colors from '@/shared/theme/colors'
import { useRouter } from 'expo-router'
import { alpha } from '@/shared/theme/utils'
import useWallet from './useWallet'
import Divider from '@/shared/ui/Divider'
import CreateWalletIcon from './CreateWalletIcon'
import ImportWalletIcon from './ImportWalletIcon'
import useStore from '../store'
// import { setSelectedWalletId } from '@/lib/wallet'

export default function ManageWallets() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const { wallets, selectedWalletId, selectWalletId } = useStore()
  // const [loadingWalletId, setLoadingWalletId] = useState<string | null>(null)

  function handleCreateWallet() {
    router.push('/wallet/create')
  }

  function handleImportWallet() {
    router.push('/wallet/import')
  }

  function handleSelectWallet(walletId: string) {
    try {
      // setLoadingWalletId(walletId)
      selectWalletId(walletId) // Assuming selectWalletId is a synchronous function
      // Assuming selectWalletId is or can be modified to return a Promise
      // await setSelectedWalletId(walletId)
      // await revalidateSelectedWalletId()
    } catch (error) {
      console.error('Error selecting wallet:', error)
      // Handle error if needed - you could add error state if required
    } finally {
      router.dismiss()
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
        <View style={styles.walletList}>
          {
            /* loadingWallets ? (
            <View style={[styles.walletBox, isDark && styles.walletBoxDark]}>
              <View style={styles.emptyWalletBox}>
                <Text style={[styles.subText, isDark && styles.subTextDark]}>
                  Loading wallets...
                </Text>
              </View>
            </View>
          ) :  */ wallets === undefined ? (
              <View style={[styles.walletBox, isDark && styles.walletBoxDark]}>
                <View style={styles.emptyWalletBox}>
                  <Text style={[styles.subText, isDark && styles.subTextDark]}>No wallets </Text>
                </View>
              </View>
            ) : wallets.length > 0 ? (
              wallets.map((wallet, index) => {
                const isSelected =
                  wallet.walletId === selectedWalletId /* && loadingWalletId === null */
                const first = index === 0
                const last = index === wallets.length - 1

                return (
                  <Fragment key={index}>
                    <Pressable
                      key={wallet.walletId}
                      style={[
                        styles.walletBox,
                        first && styles.walletBoxFirst,
                        last && styles.walletBoxLast,
                        isDark && styles.walletBoxDark,
                        // loadingWallets && styles.walletBoxLoading,
                        // isSelected && styles.selectedWalletBox,
                        // isDark && isSelected && styles.selectedWalletBoxDark,
                        // wallet.walletId === loadingWalletId && styles.walletBoxLoading,
                      ]}
                      onPress={() => handleSelectWallet(wallet.walletId)}
                      // disabled={loadingWalletId !== null} // Disable all selections during loading
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.walletHeader}>
                          {
                            /* wallet.walletId === loadingWalletId ? (
                            <ActivityIndicator size={20} color={colors.primary} />
                          ) :  */ <View style={styles.radioContainer}>
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
                          }
                          <Text
                            style={[
                              styles.walletName,
                              isDark && styles.walletNameDark,
                              isSelected && styles.walletNameSelected,
                            ]}
                          >
                            {wallet.walletName}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                    {!last ? (
                      <Divider
                        orientation="horizontal"
                        color={
                          isDark ? alpha(colors.background.light, 0.1) : colors.background.light
                        }
                      />
                    ) : null}
                  </Fragment>
                )
              })
            ) : (
              <View style={[styles.walletBox, isDark && styles.walletBoxDark]}>
                <View style={styles.emptyWalletBox}>
                  <Text style={[styles.subText, isDark && styles.subTextDark]}>
                    No wallets found
                  </Text>
                </View>
              </View>
            )
          }
        </View>
        <Divider
          orientation="horizontal"
          color={
            isDark ? alpha(colors.background.light, 0.05) : alpha(colors.background.dark, 0.05)
          }
        />

        <View>
          <Pressable
            onPress={handleCreateWallet}
            style={[styles.walletBox, styles.walletBoxFirst, isDark && styles.walletBoxDark]}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CreateWalletIcon size={24} color={colors.primary} />
              <Text style={styles.actionButton}>Create New Wallet</Text>
            </View>
          </Pressable>
          <Divider
            orientation="horizontal"
            color={isDark ? alpha(colors.background.light, 0.1) : colors.background.light}
          />

          <Pressable
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
          </Pressable>
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
    backgroundColor: colors.white,
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
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  selectedWalletBox: {
    backgroundColor: colors.border.light, // alpha(colors.primary, 0.1),
    // borderColor: alpha(colors.primary, 0.2),
    // borderWidth: 1,
  },
  selectedWalletBoxDark: {
    backgroundColor: colors.border.dark,
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
    fontWeight: '400',
    color: colors.textSecondary.light,
  },
  walletNameSelected: {
    // fontWeight: '600',
    color: colors.primary,
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
    fontWeight: '400',
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
})
