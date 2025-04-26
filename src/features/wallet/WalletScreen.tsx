// React and React Native
import { Link } from 'expo-router'
import { StyleSheet, Text, Pressable, useColorScheme, View } from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import useStore from '../store'

// Components
import WalletAccounts from './WalletAccounts'
import WalletBalance from './WalletBalance'
// import useStore from '../store'

export default function WalletScreen() {
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

  const selectedWalletId = useStore(state => state.selectedWalletId)
  const wallets = useStore(state => state.wallets)

  if (wallets === undefined || wallets?.length === 0) {
    // create link to wallet/manage
    return (
      <View style={[styles.root, isDark && styles.rootDark]}>
        <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
          <Text style={[styles.walletName, isDark && styles.walletNameDark]}>No wallets found</Text>
          <Link href="/wallet/create" style={[styles.button, styles.primaryButton]}>
            <Text style={styles.buttonText}>Create a wallet</Text>
          </Link>
        </View>
      </View>
    )
  } else if (selectedWalletId === undefined) {
    // create link to wallet/manage
    return (
      <View style={[styles.root, isDark && styles.rootDark]}>
        <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
          <Text style={[styles.walletName, isDark && styles.walletNameDark]}>
            No wallet selected
          </Text>
          <Link href="/wallet/manage" style={[styles.button, styles.primaryButton]}>
            <Text style={styles.buttonText}>Select a wallet</Text>
          </Link>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <WalletBalance />
      <View style={styles.actionsSection}>
        <Pressable onPress={handleSend} style={[styles.button, styles.primaryButton]}>
          <Text style={styles.buttonText}>Send</Text>
        </Pressable>

        <Pressable
          onPress={handleReceive}
          style={[styles.button, isDark ? styles.secondaryButtonDark : styles.secondaryButton]}
        >
          <Text style={[styles.buttonText, isDark && styles.buttonTextDark]}>Receive</Text>
        </Pressable>
      </View>
      <View style={styles.accountsSection}>
        <Text style={[styles.accountsHeader, isDark && styles.accountsHeaderDark]}>Accounts</Text>

        <WalletAccounts />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    // backgroundColor: 'blue',
    flex: 1,
    padding: 16,
    gap: 32,
  },
  rootDark: {
    backgroundColor: colors.background.dark,
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
    backgroundColor: alpha(colors.secondary, 0.1),
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
    justifyContent: 'space-between',
    gap: 12,
  },
  buttonIcon: {
    marginRight: 8,
  },
  button: {
    flexGrow: 1,
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
  neutralButton: {
    backgroundColor: alpha(colors.black, 0.2),
  },
  neutralButtonDark: {
    backgroundColor: alpha(colors.white, 0.2),
  },
  buttonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
  },
  buttonTextDark: {
    color: colors.black,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    borderWidth: 1,
    borderColor: alpha(colors.border.light, 0.2),
    borderRadius: 8,
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
})
