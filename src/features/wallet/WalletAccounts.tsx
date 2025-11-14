import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native'
import { Account } from '@/core/models/account'
import BitcoinLogo from '@/assets/bitcoin-logo'
import LightningLogo from '@/assets/lightning-logo'
import { ReactNode } from 'react'
import { alpha } from '@/ui/utils'
import colors from '@/ui/colors'
import { useWallet } from '@/features/wallet'
import { useTransactions } from '@/features/transactions'
import { useSettings } from '@/features/settings'
import { formatBalance } from './utils'
import { GlassView } from 'expo-glass-effect'
import Divider from '@/ui/Divider'

const LAYER_LABELS: Record<number, string> = {
  1: 'On-Chain',
  2: 'Lightning',
}

const PURPOSE_ICONS: Record<number, ReactNode> = {
  44: <BitcoinLogo width={32} height={32} />,
  49: <BitcoinLogo width={32} height={32} />,
  84: <BitcoinLogo width={32} height={32} />,
  9735: <LightningLogo width={32} height={32} />,
}

const getPurposeIcon = (purpose: number): ReactNode =>
  PURPOSE_ICONS[purpose] || <BitcoinLogo width={24} height={24} />

const isOnChainPurpose = (purpose: number): boolean => purpose !== 9735
const isLightningPurpose = (purpose: number): boolean => purpose === 9735

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

  const accounts = wallets.find(wallet => wallet.id === activeWalletId)?.accounts || []

  if (accounts.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.emptyState, isDark && styles.emptyStateDark]}>
          No accounts found. Please create or import a wallet.
        </Text>
      </View>
    )
  }

  // Separate accounts by type
  const onChainAccounts = accounts.filter(account => isOnChainPurpose(account.purpose))
  const lightningAccounts = accounts.filter(account => isLightningPurpose(account.purpose))

  const sections = []

  // Add On-Chain section if there are on-chain accounts
  if (onChainAccounts.length > 0) {
    sections.push({
      title: 'On-Chain',
      data: onChainAccounts,
      type: 'onchain' as const,
    })
  }

  // Add Lightning section if there are lightning accounts
  if (lightningAccounts.length > 0) {
    sections.push({
      title: 'Lightning',
      data: lightningAccounts,
      type: 'lightning' as const,
    })
  }

  return (
    <GlassView style={styles.container}>
      <FlatList
        data={sections}
        renderItem={({ item: section }) => (
          <View style={styles.section}>
            <View style={styles.sectionContent}>
              {section.data.map((account, index) => (
                <View key={account.purpose.toString()}>
                  <AccountDetails account={account} />
                  {index < section.data.length - 1 && (
                    <View style={styles.accountSeparator}>
                      <Divider
                        height={1}
                        width="100%"
                        color={
                          isDark
                            ? alpha(colors.textSecondary.dark, 0.2)
                            : alpha(colors.textSecondary.light, 0.2)
                        }
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}
        keyExtractor={item => item.title}
        contentContainerStyle={styles.flatList}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.sectionSeparator} />}
      />
    </GlassView>
  )
}

interface AccountDetailsProps {
  account: Account
}

function AccountDetails({ account }: AccountDetailsProps) {
  const { isDark } = useSettings()

  const { loading: loadingWallet, activeWalletId } = useWallet()
  // const { friendly, loading: loadingTx } = useTransactions()

  const loading = loadingWallet // || loadingTx

  // Calculate balance from transactions
  /* const calculateBalance = (): number => {
    if (!activeWalletId) return 0

    const walletCache = friendly.find(cache => cache.walletId === activeWalletId)
    if (!walletCache) return 0

    // For now, all transactions are considered on-chain
    // TODO: Filter by account type when lightning is implemented
    return friendly.reduce((balance, tx) => {
      if (tx.type === 'received') {
        return balance + tx.amount
      } else if (tx.type === 'sent') {
        return balance - tx.amount
      }
      return balance
    }, 0)
  } */

  const balance = 0 // calculateBalance()

  const accountIcon = getPurposeIcon(account.purpose)

  const getLayerLabel = (purpose: number): string => {
    return LAYER_LABELS[isLightningPurpose(purpose) ? 2 : 1] || 'Unknown Layer'
  }

  return (
    <View style={styles.accountContainer}>
      <View style={styles.accountInfoRow}>
        <View style={styles.accountSection}>
          <View style={styles.accountIcon}>{accountIcon}</View>
          <GlassView style={styles.accountDetails} tintColor={alpha(colors.background.light, 0.1)}>
            <Text style={[styles.accountTitle, isDark && styles.accountTitleDark]}>
              {getLayerLabel(account.purpose)}
            </Text>
          </GlassView>
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
                  {`${formatBalance(balance / 1e8, 'BTC')} BTC`}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={styles.buttonsContainer}>
        {/* {isLightningAccount && (
          <View style={styles.connectionStatus}>
            <View style={[styles.nodeStatus, nodeConnected && styles.nodeStatusConnected]}>
              <Text
                style={[styles.nodeStatusText, nodeConnected && styles.nodeStatusTextConnected]}
              >
                {nodeConnected ? '●' : '○'}
              </Text>
            </View>
            <Text style={[styles.connectionStatusText, isDark && styles.connectionStatusTextDark]}>
              {nodeConnected ? 'Conectado' : 'Desconectado'}
            </Text>
          </View>
        )} */}

        {/* <Button
          style={{ flex: 1 }}
          onPress={handleNavigateToTransactions}
          startIcon={
            <Ionicons name="list" size={16} color={isDark ? colors.text.dark : colors.text.light} />
          }
        >
          <Text
            style={[styles.transactionsButtonText, isDark && styles.transactionsButtonTextDark]}
          >
            Transações
          </Text>
        </Button> */}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: alpha(colors.background.dark, 0.1),
    borderRadius: 32,
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
    // gap: 16,
  },
  section: {
    // marginBottom: 8,
  },
  sectionHeader: {
    // paddingHorizontal: 16,
    // paddingVertical: 8,
    // marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  sectionContent: {
    // Container for accounts within a section
  },
  sectionSeparator: {
    height: 1,
    width: '95%',
    alignSelf: 'center',
    backgroundColor: alpha(colors.background.dark, 0.1),
  },
  accountSeparator: {
    marginVertical: 8,
  },
  accountContainer: {
    // backgroundColor: 'green',
    borderRadius: 32,
    padding: 16,
    alignItems: 'center',
  },
  accountInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    // marginBottom: 16,
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
    color: colors.text.dark,
  },
  accountIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  accountDetails: {
    padding: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accountBalance: {
    fontSize: 14,
    fontWeight: '600',
    color: alpha(colors.text.light, 0.7),
  },
  accountBalanceDark: {
    color: alpha(colors.text.dark, 0.7),
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
    borderRadius: 32,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    borderRadius: 32,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  transactionsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.light,
  },
  connectionStatus: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: alpha(colors.background.light, 0.5),
  },
  connectionStatusText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
  },
  connectionStatusTextDark: {
    color: colors.text.dark,
  },
  transactionsButtonTextDark: {
    color: colors.text.dark,
  },
})
