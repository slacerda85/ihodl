import {
  View,
  Text,
  TouchableOpacity,
  Image,
  useColorScheme,
  StyleSheet,
  FlatList,
} from 'react-native'
import { Account } from '@/models/account'
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import { ReactNode } from 'react'
import colors from '@/shared/theme/colors'
import { calculateBalance } from '@/lib/account'
import { IconSymbol } from '@/shared/ui/icon-symbol'
import { alpha } from '@/shared/theme/utils'

interface WalletAccountsProps {
  isLoading: boolean
  accounts: Account[]
}

const coinTypeToLabel: Record<number, string> = {
  0: 'BTC',
  1: 'Testnet',
  // Add more coin types as needed
}

const purposeToLabel: Record<number, string> = {
  44: 'Legacy',
  49: 'SegWit',
  84: 'BIP84',
  // Add more purposes as needed
}

const purposeToIcon: Record<number, ReactNode> = {
  44: <BitcoinLogo width={24} height={24} />,
  49: <BitcoinLogo width={24} height={24} />,
  84: <BitcoinLogo width={24} height={24} />,
  86: (
    <Image
      source={require('@/shared/assets/lightning-logo.png')}
      style={{ width: 24, height: 24 }}
    />
  ),
  // Add more purposes as needed
}

function getPurposeIcon(purpose: number) {
  return purposeToIcon[purpose] || <BitcoinLogo width={24} height={24} />
}

export default function WalletAccounts({ accounts = [] }: WalletAccountsProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const handleAccountPress = (accountIndex: number) => {
    // Handle account press logic here
    console.log(`Account ${accountIndex} pressed`)
  }

  const renderAccount = ({ item }: { item: Account }) => {
    const usedAddresses = item.addressInfo.filter(addr => addr.txs.length > 0)
    const totalTxs = item.addressInfo.reduce((sum, addr) => sum + addr.txs.length, 0)

    const totalBalance = calculateBalance(item.addressInfo).balance

    // Format account name using purpose and coin type labels
    const purposeLabel = purposeToLabel[item.purpose] || `Purpose ${item.purpose}`
    const coinLabel = coinTypeToLabel[item.coinType] || `Coin ${item.coinType}`
    const accountName = `${purposeLabel}`

    // Get the appropriate icon
    const accountIcon = getPurposeIcon(item.purpose)

    return (
      <View style={[styles.accountContainer, isDark && styles.accountContainerDark]}>
        <TouchableOpacity
          style={[styles.accountHeader, isDark && styles.accountHeaderDark]}
          onPress={() => handleAccountPress(item.accountIndex)}
        >
          <View style={styles.accountIconContainer}>{accountIcon}</View>

          <View style={styles.transactionDetails}>
            <Text style={[styles.accountTitle, isDark && styles.accountTitleDark]}>
              {accountName}
            </Text>

            <View style={styles.accountBalanceWrapper}>
              <Text style={[styles.accountBalance, isDark && styles.accountBalanceDark]}>
                {totalBalance.toLocaleString('en-US', { maximumFractionDigits: 8 })}
              </Text>
              <Text style={styles.accountUnit}>{coinLabel}</Text>
            </View>
          </View>

          <View style={styles.accountSummary}>
            <View>
              <Text style={[styles.summaryText, isDark && styles.summaryTextDark]}>
                {usedAddresses.length} used address{usedAddresses.length !== 1 ? 'es' : ''}
              </Text>
              <Text style={[styles.summaryText, isDark && styles.summaryTextDark]}>
                {totalTxs} transaction{totalTxs !== 1 ? 's' : ''}
              </Text>
            </View>
            <IconSymbol
              name={'chevron.right'}
              size={20}
              color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            />
          </View>
        </TouchableOpacity>
      </View>
    )
  }

  if (accounts.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.emptyState, isDark && styles.emptyStateDark]}>
          No accounts found. Please create or import a wallet.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={accounts}
        renderItem={renderAccount}
        keyExtractor={item => item.accountIndex.toString()}
        contentContainerStyle={styles.flatList}
        style={styles.accountsList}
        showsVerticalScrollIndicator={false}
      />
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
    backgroundColor: alpha(colors.white, 0.1),
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: alpha(colors.black, 0.1),
  },
  accountHeaderDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  accountTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
  },
  accountTitleDark: {
    color: colors.textSecondary.dark,
  },
  accountSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Add these to your StyleSheet
  accountIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  transactionDetails: {
    flex: 1,
    gap: 2,
  },
  accountBalanceWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accountBalance: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  accountBalanceDark: {
    color: colors.text.dark,
  },
  accountUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  summaryText: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  summaryTextDark: {
    color: colors.textSecondary.dark,
  },
  /* addressList: {
      maxHeight: 300,
    }, */
  addressItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: alpha(colors.black, 0.1),
  },
  addressItemDark: {
    borderTopColor: alpha(colors.white, 0.05),
  },
  addressInfo: {
    flex: 1,
  },
  addressIndex: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
  },
  addressIndexDark: {
    color: colors.text.dark,
  },
  addressText: {
    fontSize: 12,
    color: colors.textSecondary.light,
    marginVertical: 4,
  },
  addressTextDark: {
    color: colors.textSecondary.dark,
  },
  txCount: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  txCountDark: {
    color: colors.textSecondary.dark,
  },
  viewButton: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  viewButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    // backgroundColor: colors.white,
    padding: 16,
    // marginTop: 50,
    // borderTopLeftRadius: 24,
    // borderTopRightRadius: 24,
  },
  modalContainerDark: {
    backgroundColor: colors.background.dark,
  },
  modalHeader: {
    // marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
  },
  modalTitleDark: {
    color: colors.text.dark,
  },
  modalAddress: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginBottom: 12,
  },
  modalAddressDark: {
    color: colors.textSecondary.dark,
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 8,
  },
  closeButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  closeButtonTextDark: {
    color: colors.primary,
  },
  txList: {
    flex: 1,
  },
  txItem: {
    backgroundColor: alpha(colors.black, 0.05),
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  txItemDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  txId: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 8,
  },
  txIdDark: {
    color: colors.text.dark,
  },
  txDetail: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginBottom: 4,
  },
  txDetailDark: {
    color: colors.textSecondary.dark,
  },
  txDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: alpha(colors.black, 0.1),
  },
  txDetailHeader: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
    marginVertical: 8,
  },
  txDetailHeaderDark: {
    color: colors.text.dark,
  },
  txDetailItem: {
    fontSize: 12,
    color: colors.textSecondary.light,
    marginBottom: 4,
  },
  txDetailItemDark: {
    color: colors.textSecondary.dark,
  },
  txOutput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  txAmount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  txAmountDark: {
    color: colors.text.dark,
  },
  noTxs: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.textSecondary.light,
    marginTop: 24,
  },
  noTxsDark: {
    color: colors.textSecondary.dark,
  },
})
