import { View, Text, StyleSheet } from 'react-native'
import colors from '@/ui/colors'
import { useIsDark } from '@/ui/features/settings'
import { formatBalance } from './utils'
//import { useAddress } from '../address/AddressProvider'
import LoadingWalletBalance from './LoadingWalletBalance'
import { useAddressLoading, useBalance } from '../address/AddressProviderV2'

export default function WalletBalance() {
  const isDark = useIsDark()
  const { balance } = useBalance()
  const loading = useAddressLoading()

  if (loading) {
    return <LoadingWalletBalance />
  }

  return (
    <View style={styles.balanceSection}>
      <View
        style={{
          width: '100%',
          // backgroundColor: 'red',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <Text style={[styles.balanceAmount, isDark && styles.balanceAmountDark]}>
          {formatBalance(balance, 'BTC')}
          <Text style={[styles.balanceCurrency, isDark && styles.balanceCurrencyDark]}>
            {' '}
            {'BTC'}
          </Text>
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  balanceSection: {
    paddingTop: 16,
    alignItems: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  loadingTextDark: {
    color: colors.textSecondary.dark,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  balanceLabelDark: {
    color: colors.textSecondary.dark,
  },
  balanceAmount: {
    flex: 2,
    fontSize: 24,
    fontFamily: 'ui-monospace',
    fontWeight: '600',
    color: colors.textSecondary.light,
    textShadowRadius: 1,
    textAlign: 'center',
  },
  balanceAmountDark: {
    color: colors.textSecondary.dark,
  },
  balanceCurrency: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textSecondary.light,
  },
  balanceCurrencyDark: {
    // color: colors.primary,
    color: colors.textSecondary.dark,
  },
  unitToggle: {
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  toggleIcon: {
    fontSize: 16,
    marginLeft: 4,
  },
  unitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unitButton: {
    borderRadius: 32,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
