import {
  View,
  Text,
  Pressable,
  Image,
  useColorScheme,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import { Account } from '@/models/account'
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import { Fragment, Key, ReactNode, useEffect, useState } from 'react'
import { alpha } from '@/shared/theme/utils'
import colors from '@/shared/theme/colors'
import { WalletData } from '@/models/wallet'
import useWallet from './useWallet'
import { createRootExtendedKey, fromMnemonic } from '@/lib/key'
import { getTxHistory } from '@/lib/transactions'
import useTransactions from '../transactions/useTransactions'
import useStore from '../store'

interface WalletAccountsProps {
  wallet: WalletData
}

const purposeToLabel: Record<number, string> = {
  44: 'Legacy',
  49: 'SegWit',
  84: 'BIP84',
  // Add more purposes as needed
}

const purposeToIcon: Record<number, ReactNode> = {
  44: <BitcoinLogo width={32} height={32} />,
  49: <BitcoinLogo width={32} height={32} />,
  84: <BitcoinLogo width={32} height={32} />,
  86: (
    <Image
      source={require('@/shared/assets/lightning-logo.png')}
      style={{ width: 32, height: 32 }}
    />
  ),
  // Add more purposes as needed
}

function getPurposeIcon(purpose: number) {
  return purposeToIcon[purpose] || <BitcoinLogo width={24} height={24} />
}

export default function WalletAccounts() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const wallets = useStore(state => state.wallets)
  const activeWalletId = useStore(state => state.activeWalletId)

  if (!activeWalletId) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
          No wallet selected
        </Text>
      </View>
    )
  }

  const accounts = wallets.find(wallet => wallet.walletId === activeWalletId)?.accounts || []
  const renderAccount = ({ item }: { item: Account }) => {
    if (accounts === undefined || accounts.length === 0) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={[styles.emptyState, isDark && styles.emptyStateDark]}>
            No accounts found. Please create or import a wallet.
          </Text>
        </View>
      )
    }

    return (
      <AccountDetails
        account={item}
        // balance={balance}
        // useSatoshis={false}
        // loading={loadingBalance}
      />
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        renderItem={renderAccount}
        keyExtractor={(item: Account) => item.purpose.toString()}
        contentContainerStyle={styles.flatList}
        style={styles.accountsList}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

function AccountDetails({ account }: { account: Account }) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const getBalance = useStore(state => state.getBalance)
  const loading = useStore(state => state.loading)
  const balance = getBalance()

  // Format account name using purpose and coin type labels
  const purposeLabel = purposeToLabel[account.purpose] || `Purpose ${account.purpose}`

  const accountName = `${purposeLabel}`

  // Get the appropriate icon
  const accountIcon = getPurposeIcon(account.purpose)

  const handleAccountPress = (accountIndex: number) => {
    // Handle account press logic here
    console.log(`Account ${accountIndex} pressed`)
  }

  return (
    <View style={[styles.accountContainer, isDark && styles.accountContainerDark]}>
      <Pressable
        style={[styles.accountHeader, isDark && styles.accountHeaderDark]}
        onPress={() => handleAccountPress(account.accountIndex)}
      >
        <View style={styles.accountIconContainer}>{accountIcon}</View>
        <View style={styles.accountDetails}>
          <Text style={styles.accountUnit}>{'BTC'}</Text>
          <Text style={[styles.accountTitle, isDark && styles.accountTitleDark]}>
            {accountName}
          </Text>
        </View>
        <View style={styles.accountBalanceWrapper}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Fragment>
              <Text style={[styles.accountBalance, isDark && styles.accountBalanceDark]}>
                {balance}
              </Text>
              <Text style={styles.balanceUnit}>{'BTC'}</Text>
            </Fragment>
          )}
        </View>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.text.light,
  },
  loadingTextDark: {
    color: colors.text.dark,
  },
  emptyState: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.textSecondary.light,
    marginTop: 24,
  },
  emptyStateDark: {
    color: colors.textSecondary.dark,
  },
  flatList: {
    paddingBottom: 48,
    gap: 1,
  },
  accountsList: {
    flex: 1,
  },
  accountContainer: {
    backgroundColor: colors.white,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  accountContainerDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 4,
  },
  accountHeaderDark: {
    backgroundColor: alpha(colors.background.light, 0.01),
  },
  accountTitle: {
    backgroundColor: alpha(colors.black, 0.1),
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
  },
  accountTitleDark: {
    backgroundColor: alpha(colors.white, 0.2),
    color: colors.text.dark,
  },
  accountUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  accountIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  accountDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accountBalanceWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accountBalance: {
    fontSize: 14,
    // fontWeight: 'bold',
    color: colors.text.light,
  },
  accountBalanceDark: {
    color: colors.text.dark,
  },
  balanceUnit: {
    fontSize: 14,
    color: colors.primary,
  },
  /* accountSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  }, */
  /* 
  accountBalanceWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
   */

  /* summaryText: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  summaryTextDark: {
    color: colors.textSecondary.dark,
  }, */
})
