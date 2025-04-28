// React and React Native
import { Link, useRouter } from 'expo-router'
import { StyleSheet, Text, Pressable, useColorScheme, View } from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import useStore from '../store'

// Components
import WalletBalance from './WalletBalance'
import { useEffect } from 'react'
import WalletAccounts from './WalletAccounts'
import { useHeaderHeight } from '@react-navigation/elements'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import Divider from '@/shared/ui/Divider'
import CreateWalletIcon from './CreateWalletIcon'
import ImportWalletIcon from './ImportWalletIcon'
// import useStore from '../store'

export default function WalletScreen() {
  const router = useRouter()
  const headerHeight = useHeaderHeight()
  const tabBarHeight = useBottomTabBarHeight()
  // theme
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  function handleSend() {
    // Navigate to send screen
    // router.push('/transactions/send')
  }

  function handleReceive() {
    // Navigate to receive screen
    // router.push('/transactions/receive')
  }

  function handleCreateWallet() {
    router.push('/wallet/create')
  }

  function handleImportWallet() {
    router.push('/wallet/import')
  }

  const activeWalletId = useStore(state => state.activeWalletId)
  const fetchTransactions = useStore(state => state.fetchTransactions)
  const wallets = useStore(state => state.wallets)

  useEffect(() => {
    if (activeWalletId) {
      fetchTransactions(activeWalletId)
    }
  }, [activeWalletId, fetchTransactions])

  if (wallets === undefined || wallets?.length === 0) {
    // create link to wallet/manage
    return (
      <Container>
        <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
          <Text style={[styles.walletName, isDark && styles.walletNameDark]}>No wallets found</Text>
          <Divider
            orientation="horizontal"
            color={
              isDark ? alpha(colors.background.light, 0.05) : alpha(colors.background.dark, 0.05)
            }
          />
          <View>
            <Pressable
              onPress={handleCreateWallet}
              style={[
                styles.neutralButton,
                styles.neutralButtonFirst,
                isDark && styles.neutralButtonDark,
              ]}
            >
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CreateWalletIcon size={24} color={colors.primary} />
                <Text style={styles.neutralButtonText}>Create New Wallet</Text>
              </View>
            </Pressable>
            <Divider
              orientation="horizontal"
              color={isDark ? alpha(colors.background.light, 0.1) : colors.background.light}
            />

            <Pressable
              onPress={handleImportWallet}
              style={[
                styles.neutralButton,
                styles.neutralButtonLast,
                // styles.secondaryButton,
                isDark && styles.neutralButtonDark,
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ImportWalletIcon size={24} color={colors.primary} />

                <Text style={styles.neutralButtonText}>Import Wallet</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Container>
    )
  } else if (activeWalletId === undefined) {
    // create link to wallet/manage
    return (
      <Container>
        <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
          <Text style={[styles.walletName, isDark && styles.walletNameDark]}>
            No wallet selected
          </Text>
          <View style={[styles.button, styles.primaryButton]}>
            <Link href="/wallet/manage">
              <Text style={[styles.buttonText, isDark && styles.buttonTextSecondary]}>
                Select a wallet
              </Text>
            </Link>
          </View>
        </View>
      </Container>
    )
  }

  return (
    <Container>
      <WalletBalance />
      <View style={styles.actionsSection}>
        <Pressable onPress={handleSend} style={[styles.button, styles.primaryButton]}>
          <Text style={styles.buttonText}>Send</Text>
        </Pressable>

        <Pressable
          onPress={handleReceive}
          style={[styles.button, isDark ? styles.secondaryButtonDark : styles.secondaryButton]}
        >
          <Text style={[styles.buttonText, isDark && styles.buttonTextSecondary]}>Receive</Text>
        </Pressable>
      </View>
      <View style={styles.accountsSection}>
        <Text style={[styles.accountsHeader, isDark && styles.accountsHeaderDark]}>Accounts</Text>

        <WalletAccounts />
      </View>
    </Container>
  )
}

function Container({ children }: { children: React.ReactNode }) {
  const headerHeight = useHeaderHeight()
  const tabBarHeight = useBottomTabBarHeight()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View
      style={[
        styles.root,
        isDark && styles.rootDark,
        {
          paddingTop: headerHeight + 16,
          paddingBottom: tabBarHeight + 16,
        },
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
    gap: 32,
  },
  rootDark: {
    // backgroundColor: colors.background.dark,
  },
  section: {
    marginBottom: 0,
  },
  walletName: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text.light,
    marginBottom: 8,
  },
  walletNameDark: {
    color: colors.text.dark,
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor: alpha(colors.secondary, 0.1),
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 4,
  },
  offlineText: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  balanceSection: {
    alignItems: 'center',
    borderRadius: 12,
    gap: 4,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  balanceLabelDark: {
    color: colors.textSecondary.dark,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text.light,
  },
  balanceAmountDark: {
    color: colors.text.dark,
  },
  balanceCurrency: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  actionsSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  buttonIcon: {
    marginRight: 8,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.background.dark,
  },
  secondaryButtonDark: {
    backgroundColor: colors.background.light,
  },
  buttonText: {
    color: colors.text.light,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
  },
  buttonTextSecondary: {
    color: colors.text.dark,
  },
  accountsSection: {
    flexGrow: 1,
  },
  accountsHeader: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 16,
  },
  accountsHeaderDark: {
    color: colors.text.dark,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 16,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  emptyState: {
    /* alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    borderWidth: 1,
    borderColor: alpha(colors.border.light, 0.2),
    borderRadius: 8, */
    paddingHorizontal: 16,
    gap: 24,
  },
  emptyStateDark: {
    borderColor: alpha(colors.border.dark, 0.2),
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyStateText: {
    fontSize: 20,
    color: colors.textSecondary.light,
  },
  emptyStateTextDark: {
    color: colors.textSecondary.dark,
  },
  // wallet box
  neutralButton: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  neutralButtonDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  neutralButtonFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  neutralButtonLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  neutralButtonText: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.primary,
  },
  selectedWalletBox: {
    backgroundColor: colors.border.light, // alpha(colors.primary, 0.1),
    // borderColor: alpha(colors.primary, 0.2),
    // borderWidth: 1,
  },
  selectedWalletBoxDark: {
    backgroundColor: colors.border.dark,
  },
  neutralButtonLoading: {
    opacity: 0.5,
  },
})
