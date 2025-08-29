import {
  View,
  Text,
  Image,
  useColorScheme,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { Account } from '@/models/account'
import BitcoinLogo from '@/assets/bitcoin-logo'
import { ReactNode } from 'react'
import { alpha } from '@/ui/utils'
import colors from '@/ui/colors'
import useStorage from '../storage'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { formatBalance } from './utils'

const purposeToLabel: Record<number, string> = {
  44: 'Legacy',
  49: 'SegWit',
  84: 'Native SegWit',
  // Add more purposes as needed
}

const purposeToIcon: Record<number, ReactNode> = {
  44: <BitcoinLogo width={32} height={32} />,
  49: <BitcoinLogo width={32} height={32} />,
  84: <BitcoinLogo width={32} height={32} />,
  86: <Image source={require('@/assets/lightning-logo.png')} style={{ width: 32, height: 32 }} />,
  // Add more purposes as needed
}
/* 
const coinTypetoLabel: Record<CoinType, string> = {
  0: 'BTC',
} */

function getPurposeIcon(purpose: number) {
  return purposeToIcon[purpose] || <BitcoinLogo width={24} height={24} />
}

export default function WalletAccounts() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const wallets = useStorage(state => state.wallets)
  const activeWalletId = useStorage(state => state.activeWalletId)

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

    return <AccountDetails account={item} />
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
        scrollEnabled={false}
      />
    </View>
  )
}

function AccountDetails({ account }: { account: Account }) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const router = useRouter()

  const loadingWallet = useStorage(state => state.loadingWalletState)
  const loadingTransactions = useStorage(state => state.tx.loadingTxState)
  const loading = loadingWallet || loadingTransactions
  const unit = useStorage(state => state.unit)
  const activeWalletId = useStorage(state => state.activeWalletId)
  const getBalance = useStorage(state => state.tx.getBalance)
  const walletCaches = useStorage(state => state.tx.walletCaches)

  // Check if we have cached data for the active wallet
  const hasTransactionData = activeWalletId
    ? walletCaches.some(cache => cache.walletId === activeWalletId)
    : false

  // Usar o novo método para obter saldo com verificação de segurança
  const balance =
    activeWalletId && getBalance && typeof getBalance === 'function' && hasTransactionData
      ? getBalance(activeWalletId)
      : 0

  // Format account name using purpose and coin type labels
  const purposeLabel = purposeToLabel[account.purpose] || `Purpose ${account.purpose}`

  const accountName = `${purposeLabel}`

  // Get the appropriate icon
  const accountIcon = getPurposeIcon(account.purpose)

  const handleNavigate = () => {
    // Navigate to account details screen
    router.push('/transactions')
  }

  return (
    <Pressable
      style={[styles.accountContainer, isDark && styles.accountContainerDark]}
      onPress={handleNavigate}
    >
      <View style={styles.accountSection}>
        <View style={styles.accountIcon}>{accountIcon}</View>
        <View style={styles.accountDetails}>
          <Text style={styles.accountUnit}>{'BTC'}</Text>
          <Text style={[styles.accountTitle, isDark && styles.accountTitleDark]}>
            {accountName}
          </Text>
        </View>
      </View>
      <View style={styles.accountSection}>
        <View style={styles.accountDetails}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <Text style={[styles.accountBalance, isDark && styles.accountBalanceDark]}>
              {`${formatBalance(balance, unit)} ${unit}`}
            </Text>
          )}
          <Ionicons
            name="chevron-forward"
            size={24}
            color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          />
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    // flex: 1,
    // backgroundColor: '#ff0000',
    // padding: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    // paddingBottom: 48,
    gap: 1,
  },
  accountsList: {
    // flex: 1,
  },
  accountContainer: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    gap: 24,
    // marginBottom: 12,
    // overflow: 'hidden',
    // flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountContainerDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  accountSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accountTitle: {
    backgroundColor: alpha(colors.black, 0.1),
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
  },
  accountTitleDark: {
    backgroundColor: alpha(colors.white, 0.2),
    color: colors.text.dark,
  },
  accountUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  accountIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  accountDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accountBalanceWrapper: {
    // backgroundColor: '',
    // flexDirection: 'row',
    // alignItems: 'center',
    // gap: 4,
    // padding: 16,
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
})
