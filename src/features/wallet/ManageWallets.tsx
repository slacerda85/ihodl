import { Fragment } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import colors from '@/ui/colors'
import { useRouter } from 'expo-router'
import { alpha } from '@/ui/utils'
import Divider from '@/ui/Divider'
import CreateWalletIcon from './CreateWalletIcon'
import ImportWalletIcon from './ImportWalletIcon'
import { useWallet } from './WalletProvider'
import { useSettings } from '../settings/SettingsProvider'

export default function ManageWallets() {
  const router = useRouter()
  const { isDark } = useSettings()
  // const { getAllWallets, getActiveWalletId, toggleActiveWallet } = useWallet()
  const { wallets, activeWalletId, toggleActiveWallet } = useWallet()

  function handleCreateWallet() {
    router.push('/wallet/create')
  }

  function handleImportWallet() {
    router.push('/wallet/import')
  }

  function handleSelectWallet(walletId: string) {
    toggleActiveWallet(walletId)
    router.dismiss()
  }

  return (
    <ScrollView style={styles.container}>
      <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
        <View style={styles.walletList}>
          {wallets === undefined ? (
            <View style={[styles.walletBox, isDark && styles.walletBoxDark]}>
              <View style={styles.emptyWalletBox}>
                <Text style={[styles.subText, isDark && styles.subTextDark]}>No wallets </Text>
              </View>
            </View>
          ) : wallets.length > 0 ? (
            wallets.map((wallet, index) => {
              const isSelected = wallet.id === activeWalletId /* && loadingWalletId === null */
              const first = index === 0
              const last = index === wallets.length - 1

              return (
                <Fragment key={index}>
                  <Pressable
                    key={wallet.id}
                    style={[
                      styles.walletBox,
                      first && styles.walletBoxFirst,
                      last && styles.walletBoxLast,
                      isDark && styles.walletBoxDark,
                    ]}
                    onPress={() => handleSelectWallet(wallet.id)}
                    // disabled={loadingWalletId !== null} // Disable all selections during loading
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.walletHeader}>
                        {
                          /* loading ? (
                          <ActivityIndicator size={20} color={colors.primary} />
                        ) : ( */
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
                          /* ) */
                        }
                        <Text
                          style={[
                            styles.walletName,
                            isDark && styles.walletNameDark,
                            isSelected && styles.walletNameSelected,
                          ]}
                        >
                          {wallet.name}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  {!last ? (
                    <Divider
                      orientation="horizontal"
                      color={isDark ? alpha(colors.background.light, 0.1) : colors.background.light}
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
    fontSize: 15,
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
