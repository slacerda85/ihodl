// React and React Native
import { Link, useRouter } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useWallet } from '@/features/wallet'
import { useSettings } from '@/features/settings'

// Components
import WalletBalance from './WalletBalance'
import CreateWalletIcon from './CreateWalletIcon'
import ImportWalletIcon from './ImportWalletIcon'
import ContentContainer from '@/ui/ContentContainer'
import Button from '@/ui/Button'
import { useAccount } from '../account/AccountProvider'
// import { useHeaderHeight } from '@react-navigation/elements'

export default function WalletScreen() {
  const router = useRouter()
  // theme
  const { isDark } = useSettings()

  function handleSend() {
    // Navigate to send screen
    router.push('/wallet/send' as any)
  }

  function handleReceive() {
    router.push('/wallet/receive' as any)
  }

  function handleCreateWallet() {
    router.push('/wallet/create')
  }

  function handleImportWallet() {
    router.push('/wallet/import')
  }

  // const { getActiveWalletId, getWallets } = useWallet()
  // const wallets = getWallets()
  // const activeWalletId = getActiveWalletId()
  const { activeWalletId, wallets } = useWallet()

  if (wallets === undefined || wallets?.length === 0) {
    // create link to wallet/manage
    return (
      <ContentContainer>
        <View style={styles.emptyState}>
          <Button
            onPress={handleCreateWallet}
            variant="glass"
            startIcon={<CreateWalletIcon size={24} color={colors.primary} />}
          >
            <Text style={styles.neutralButtonText}>New Wallet</Text>
          </Button>

          <Button
            onPress={handleImportWallet}
            variant="glass"
            startIcon={<ImportWalletIcon size={24} color={colors.primary} />}
          >
            <Text style={styles.neutralButtonText}>Import Wallet</Text>
          </Button>
        </View>
      </ContentContainer>
    )
  } else if (activeWalletId === undefined) {
    // create link to wallet/manage
    return (
      <ContentContainer>
        <View style={styles.emptyState}>
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
      </ContentContainer>
    )
  }

  return (
    <ContentContainer>
      <View style={{ gap: 32 }}>
        <WalletBalance />
        <View style={styles.actionsSection}>
          <Button onPress={handleSend} style={{ flex: 1 }} tintColor={alpha(colors.primary, 0.9)}>
            <Text style={[styles.buttonText]}>Send</Text>
          </Button>

          <Button onPress={handleReceive} style={{ flex: 1 }}>
            <Text style={[styles.buttonTextSecondary, isDark && styles.buttonTextSecondaryDark]}>
              Receive
            </Text>
          </Button>
        </View>

        <View style={styles.accountsSection}>
          <Text style={[styles.accountsHeader, isDark && styles.accountsHeaderDark]}>Accounts</Text>

          <WalletAccounts />
        </View>
      </View>
    </ContentContainer>
  )
}

function WalletAccounts() {
  const { isDark } = useSettings()
  const { accounts } = useAccount()

  return (
    <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={styles.section}>
      <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Accounts</Text>
      {accounts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyStateText, isDark && styles.emptyStateTextDark]}>
            No accounts found.
          </Text>
        </View>
      ) : (
        <View>
          {accounts
            .sort((a, b) => a.addressIndex - b.addressIndex)
            // .sort((a, b) => a.change - b.change)
            // .sort((a, b) => a.addressIndex - b.addressIndex)
            .map(account => (
              <View
                key={account.address}
                style={[styles.accountCard, isDark && styles.accountCardDark]}
              >
                <Text style={[styles.accountTitle, isDark && styles.accountTitleDark]}>
                  Address {account.addressIndex}
                </Text>
                <Text style={[styles.accountAddress, isDark && styles.accountAddressDark]}>
                  {account.address}
                </Text>
                <Text style={[styles.accountDetail, isDark && styles.accountDetailDark]}>
                  Purpose: {account.purpose}
                </Text>
                <Text style={[styles.accountDetail, isDark && styles.accountDetailDark]}>
                  CoinType: {account.coinType}
                </Text>
                <Text style={[styles.accountDetail, isDark && styles.accountDetailDark]}>
                  Account: {account.accountIndex}
                </Text>
                <Text style={[styles.accountDetail, isDark && styles.accountDetailDark]}>
                  Change: {account.change}
                </Text>
                <Text style={[styles.accountTxs]}>Transactions: {account.txs.length}</Text>
                {account.txs.map((tx, txIndex) => (
                  <Text key={txIndex} style={[styles.txItem, isDark && styles.txItemDark]}>
                    TX {txIndex + 1}: {tx.txid} ({tx.confirmations || 0} conf)
                  </Text>
                ))}
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
    backgroundColor: alpha(colors.primary, 0.8),
  },
  primaryButtonDark: {
    backgroundColor: alpha(colors.primary, 0.2),
    boxShadow: `0 1px 2px ${alpha(colors.primary, 0.4)}`,
  },
  buttonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
  },
  buttonTextSecondary: {
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  buttonTextSecondaryDark: {
    color: alpha(colors.textSecondary.dark, 0.85),
  },
  accountsSection: {
    // backgroundColor: 'red',
  },
  accountsHeader: {
    paddingLeft: 16,
    fontSize: 18,
    fontWeight: '500',
    color: alpha(colors.textSecondary.light, 0.7),
    marginBottom: 16,
  },
  accountsHeaderDark: {
    color: alpha(colors.textSecondary.dark, 0.7),
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
    paddingHorizontal: 16,
    gap: 24,
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
  accountCard: {
    backgroundColor: colors.background.light,
    padding: 16,
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  accountCardDark: {
    backgroundColor: colors.background.dark,
    borderColor: colors.border.dark,
  },
  accountTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
    marginBottom: 4,
  },
  accountTitleDark: {
    color: colors.text.dark,
  },
  accountAddress: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginBottom: 4,
  },
  accountAddressDark: {
    color: colors.textSecondary.dark,
  },
  accountDetail: {
    fontSize: 12,
    color: colors.textSecondary.light,
    marginBottom: 4,
  },
  accountDetailDark: {
    color: colors.textSecondary.dark,
  },
  accountTxs: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
    marginBottom: 4,
  },
  txItem: {
    fontSize: 12,
    color: colors.text.light,
    marginLeft: 16,
    marginBottom: 2,
  },
  txItemDark: {
    color: colors.text.dark,
  },
})
