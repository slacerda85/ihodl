import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
} from 'react-native'
import { Account } from '@/models/account'
import BitcoinLogo from '@/assets/bitcoin-logo'
import LightningLogo from '@/assets/lightning-logo'
import { ReactNode } from 'react'
import { alpha } from '@/ui/utils'
import colors from '@/ui/colors'
import { useWallet, useTransactions, useSettings, useLightning } from '../store'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { formatBalance } from './utils'

const purposeToLabel: Record<number, string> = {
  44: 'Legacy',
  49: 'SegWit',
  84: 'Native SegWit',
  86: 'Taproot',
  9735: 'Lightning',
  // Add more purposes as needed
}

const purposeToIcon: Record<number, ReactNode> = {
  44: <BitcoinLogo width={32} height={32} />,
  49: <BitcoinLogo width={32} height={32} />,
  84: <BitcoinLogo width={32} height={32} />,
  // 86: <Image source={require('@/assets/lightning-logo.png')} style={{ width: 32, height: 32 }} />,
  9735: <LightningLogo width={32} height={32} />,
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
  const { isDark } = useSettings()

  const { wallets, activeWalletId } = useWallet()

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
  const { isDark } = useSettings()
  const router = useRouter()

  const { loadingWalletState: loadingWallet } = useWallet()
  const { loadingTxState: loadingTransactions, getBalance } = useTransactions()
  const { getLightningBalance, getLightningChannels, isNodeConnected } = useLightning()
  const loading = loadingWallet || loadingTransactions
  const { unit, activeWalletId } = useWallet()

  // Calculate balance using the transactions hook
  const balance = activeWalletId ? getBalance(activeWalletId) : 0

  // Get Lightning data if this is a Lightning account
  const isLightningAccount = account.purpose === 9735
  const lightningBalance =
    isLightningAccount && activeWalletId ? getLightningBalance(activeWalletId) : 0
  const lightningChannels =
    isLightningAccount && activeWalletId ? getLightningChannels(activeWalletId) : []
  const nodeConnected =
    isLightningAccount && activeWalletId ? isNodeConnected(activeWalletId) : false

  // Format account name using purpose and coin type labels
  const purposeLabel = purposeToLabel[account.purpose] || `Purpose ${account.purpose}`

  const accountName = `${purposeLabel}`

  // Get the appropriate icon
  const accountIcon = getPurposeIcon(account.purpose)

  const handleNavigate = () => {
    // Navigate to account details screen
    router.push('/transactions')
  }

  const handleOpenLightningChannels = () => {
    // Navigate to lightning channels modal
    router.push('/wallet/lightning-channels' as any)
  }

  return (
    <View style={styles.accountContainerWrapper}>
      <View style={[styles.accountContainer, isDark && styles.accountContainerDark]}>
        <View style={styles.accountInfoRow}>
          <View style={styles.accountSection}>
            <View style={styles.accountIcon}>{accountIcon}</View>
            <View style={styles.accountDetails}>
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
                <>
                  <Text style={[styles.accountBalance, isDark && styles.accountBalanceDark]}>
                    {isLightningAccount
                      ? `${formatBalance(lightningBalance, unit)} ${unit}`
                      : `${formatBalance(balance, unit)} ${unit}`}
                  </Text>
                  {isLightningAccount && (
                    <View style={styles.lightningInfo}>
                      <Text
                        style={[styles.lightningChannels, isDark && styles.lightningChannelsDark]}
                      >
                        {lightningChannels.length} channels
                      </Text>
                      <View
                        style={[styles.nodeStatus, nodeConnected && styles.nodeStatusConnected]}
                      >
                        <Text
                          style={[
                            styles.nodeStatusText,
                            nodeConnected && styles.nodeStatusTextConnected,
                          ]}
                        >
                          {nodeConnected ? '●' : '○'}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
        <View style={styles.buttonsContainer}>
          <Pressable
            style={[styles.transactionsButton, isDark && styles.transactionsButtonDark]}
            onPress={handleNavigate}
          >
            <Ionicons name="list" size={16} color={isDark ? colors.text.dark : colors.text.light} />
            <Text
              style={[styles.transactionsButtonText, isDark && styles.transactionsButtonTextDark]}
            >
              Transações
            </Text>
          </Pressable>
          {isLightningAccount && (
            <Pressable
              style={[styles.lightningButton, isDark && styles.lightningButtonDark]}
              onPress={handleOpenLightningChannels}
            >
              <Ionicons name="flash" size={16} color={colors.primary} />
              <Text style={[styles.lightningButtonText, isDark && styles.lightningButtonTextDark]}>
                {lightningChannels.length > 0 ? 'Gerenciar Canais' : 'Abrir Canal'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    // flex: 1,
    // backgroundColor: '#ff0000',
    // padding: 16,
  },
  accountContainerWrapper: {
    // gap: 12,
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
    gap: 24,
  },
  accountsList: {
    // flex: 1,
  },
  accountContainer: {
    backgroundColor: colors.white,
    borderRadius: 36,
    padding: 16,
    // marginBottom: 12,
    // overflow: 'hidden',
    alignItems: 'center',
  },
  accountInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  accountContainerDark: {
    backgroundColor: 'linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(0,0,0,0.05))',
    // simulate liquid glass borders
    borderWidth: 1,
    borderTopColor: alpha(colors.white, 0.1),
    borderBottomColor: alpha(colors.white, 0.05),
    borderLeftColor: alpha(colors.white, 0.075),
    borderRightColor: alpha(colors.white, 0.05),
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
  lightningInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  lightningChannels: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  lightningChannelsDark: {
    color: colors.textSecondary.dark,
  },
  nodeStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeStatusConnected: {
    backgroundColor: colors.success,
  },
  nodeStatusText: {
    fontSize: 6,
    color: colors.white,
    fontWeight: 'bold',
  },
  nodeStatusTextConnected: {
    color: colors.white,
  },
  lightningButton: {
    backgroundColor: alpha(colors.primary, 0.1),
    borderRadius: 32,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // borderWidth: 1,
    // borderColor: colors.primary,
    flex: 1,
  },
  lightningButtonDark: {
    backgroundColor: alpha(colors.primary, 0.1),
    // borderColor: colors.primary,
  },
  lightningButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  lightningButtonTextDark: {
    color: colors.primary,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  transactionsButton: {
    backgroundColor: alpha(colors.black, 0.08),
    borderRadius: 32,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // borderWidth: 1,
    // borderColor: alpha(colors.black, 0.1),
    flex: 1,
  },
  transactionsButtonDark: {
    backgroundColor: alpha(colors.white, 0.08),
    // borderColor: alpha(colors.white, 0.2),
  },
  transactionsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.light,
  },
  transactionsButtonTextDark: {
    color: colors.text.dark,
  },
})
