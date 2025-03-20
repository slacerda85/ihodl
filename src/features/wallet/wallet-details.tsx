import { Link } from 'expo-router'
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { useWallet } from './wallet-provider'
import WalletAccounts from './wallet-accounts'

export default function WalletDetails() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const { wallets, selectedWalletId } = useWallet()

  const wallet = wallets.find(wallet => wallet.walletId === selectedWalletId)
  const balance = wallet?.transactions.reduce((acc, tx) => acc + tx.value, 0) || 0

  function handleSend() {
    // Navigate to send screen
    // router.push('/wallet/send')
  }

  function handleReceive() {
    // Navigate to receive screen
    // router.push('/wallet/receive')
  }

  // if no wallets, show empty state and a Link component to navigate to create wallet screen
  if (!wallet) {
    return (
      <View style={[styles.root, isDark && styles.rootDark]}>
        <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
          <Text style={[styles.emptyStateText, isDark && styles.emptyStateTextDark]}>
            No wallets found
          </Text>
          <Link style={[styles.button, styles.primaryButton]} href="/wallet/create">
            <Text style={{ color: colors.white, fontWeight: 500, fontSize: 16 }}>
              Create wallet
            </Text>
          </Link>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.balanceSection}>
        <Text style={[styles.balanceLabel, isDark && styles.balanceLabelDark]}>
          Current Balance
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.balanceAmount, isDark && styles.balanceAmountDark]}>
            {balance.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}
          </Text>
          <Text style={styles.balanceCurrency}>BTC</Text>
        </View>
      </View>
      <View style={styles.actionsSection}>
        <TouchableOpacity onPress={handleSend} style={[styles.button, styles.primaryButton]}>
          <View style={styles.buttonContent}>
            {/* <IconSymbol name="arrow.up" size={20} color="white" style={styles.buttonIcon} /> */}
            <Text style={styles.buttonText}>Send</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleReceive}
          style={[styles.button, isDark ? styles.secondaryButtonDark : styles.secondaryButton]}
        >
          <View style={styles.buttonContent}>
            <Text style={[styles.buttonText, isDark && styles.buttonTextDark]}>Receive</Text>
          </View>
        </TouchableOpacity>
      </View>
      <View style={styles.transactionsSection}>
        <WalletAccounts />
        {/* <WalletTransactions /> */}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    // backgroundColor: 'blue',
    flex: 1,
    padding: 16,
    gap: 24,
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
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  button: {
    flexGrow: 1,
    padding: 16,
    borderRadius: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.black,
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
  transactionsSection: {
    flexGrow: 1,
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
