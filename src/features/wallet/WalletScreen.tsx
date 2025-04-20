// React and React Native
import { useMemo } from 'react'
import { Link } from 'expo-router'
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native'

// Libraries
import useCache from '../cache'

// Models
import { WalletData } from '@/models/wallet'

// Utils
import { calculateBalance, discoverAccounts } from '@/lib/account'
import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'

// Components
import WalletAccounts from './WalletAccounts'
import WalletBalance from './WalletBalance'
import { useWallet } from './wallet-provider'

export default function WalletScreen() {
  // theme
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  // wallet provider
  const { wallets, selectedWalletId, loading: walletsLoading } = useWallet()
  const wallet = useMemo(
    () => wallets.find(wallet => wallet.walletId === selectedWalletId),
    [wallets, selectedWalletId],
  )

  async function fetchAccounts(walletData: WalletData) {
    try {
      const { accounts, seedPhrase } = walletData
      const seed = fromMnemonic(seedPhrase)
      // extract values for discover function
      const extendedKey = createRootExtendedKey(seed)
      const defaultAccount = accounts[0]
      const { discoveredAccounts } = await discoverAccounts(
        extendedKey,
        defaultAccount.purpose,
        defaultAccount.coinTypes[0],
        defaultAccount.accountIndex,
      )

      return discoveredAccounts
    } catch (error) {
      console.error('Failed to discover accounts:', error)
      return []
    }
  }

  const {
    data: discoveredAccounts = [],
    // error,
    isLoading,
  } = useCache(
    wallet !== undefined ? [`wallets/${selectedWalletId}`, wallet] : null,
    async ([_key, wallet]) => await fetchAccounts(wallet),
    {
      refreshInterval: 1000 * 60 * 5, // 5 minutes
    },
  )

  // wallet balance
  const totalBalance = useMemo(() => {
    if (discoveredAccounts.length > 0) {
      return calculateBalance(discoveredAccounts[0].addressInfo).balance
    }
    return 0
  }, [discoveredAccounts])

  function handleSend() {
    // Navigate to send screen
    // router.push('/wallet/send')
  }

  function handleReceive() {
    // Navigate to receive screen
    // router.push('/wallet/receive')
  }

  if (walletsLoading) {
    // show spinner
    return (
      <View style={[styles.root, isDark && styles.rootDark]}>
        <Text style={[styles.walletName, isDark && styles.walletNameDark]}>Loading wallets...</Text>
      </View>
    )
  }

  // if no wallets, show empty state and a Link component to navigate to create wallet screen
  if (!wallet) {
    return (
      <View style={[styles.root, isDark && styles.rootDark]}>
        <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
          <Text style={[styles.emptyStateText, isDark && styles.emptyStateTextDark]}>
            No wallets found
          </Text>
          <View style={styles.actionsSection}>
            <Link style={[styles.button, styles.primaryButton]} href="/wallet/create">
              <Text style={styles.buttonText}>Create wallet</Text>
            </Link>
            {/* import wallet */}
            <Link
              style={[styles.button, isDark ? styles.secondaryButtonDark : styles.secondaryButton]}
              href="/wallet/import"
            >
              <Text style={[styles.buttonText, isDark && styles.buttonTextDark]}>
                Import wallet
              </Text>
            </Link>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <WalletBalance balance={totalBalance} isLoading={isLoading} />
      <View style={styles.actionsSection}>
        <TouchableOpacity onPress={handleSend} style={[styles.button, styles.primaryButton]}>
          <Text style={styles.buttonText}>Send</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleReceive}
          style={[styles.button, isDark ? styles.secondaryButtonDark : styles.secondaryButton]}
        >
          <Text style={[styles.buttonText, isDark && styles.buttonTextDark]}>Receive</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.accountsSection}>
        <Text
          style={[styles.accountsHeader, isDark && styles.accountsHeaderDark]}
        >{`Accounts (${discoveredAccounts.length})`}</Text>

        <WalletAccounts isLoading={isLoading} accounts={discoveredAccounts} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    // backgroundColor: 'blue',
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 16,
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
  /* buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  }, */
  buttonIcon: {
    marginRight: 8,
  },
  button: {
    flex: 0.5,
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
