import { View, Text, StyleSheet, Pressable } from 'react-native'
import colors from '@/ui/colors'
import SwapIcon from './SwapIcon'
import { useSettings } from '@/ui/features/settings'
import { formatBalance } from './utils'
import { alpha } from '@/ui/utils'
import { GlassView } from 'expo-glass-effect'
// import { useAccount } from '../account/AccountProvider'
import { useAddress } from '../address/AddressProvider'
import Utxos from '../utxo/Utxos'
import Skeleton from '@/ui/components/Skeleton'
// import TransactionService from '@/core/services/transaction'
// import { transactions } from '@/lib'

export default function WalletBalance() {
  const { isDark } = useSettings()
  const { balance, loading, utxos } = useAddress()
  // const loading = true

  const LoadingWalletBalance = () => (
    <View style={styles.balanceSection}>
      <View
        style={{
          width: '100%',
          // backgroundColor: 'blue',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <View style={{ width: 48 }} />
        <Skeleton height={30} width={150} />
        <Skeleton width={48} height={48} borderRadius={32} />
      </View>
      {/* Fake Utxos skeletons */}
      {/* <View style={{ marginTop: 16, gap: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={50} borderRadius={8} />
        ))}
      </View> */}
    </View>
  )

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
        <View style={{ flex: 1, alignItems: 'center' }} />
        <Text style={[styles.balanceAmount, isDark && styles.balanceAmountDark]}>
          {formatBalance(balance, 'BTC')}
          <Text style={[styles.balanceCurrency, isDark && styles.balanceCurrencyDark]}>
            {' '}
            {'BTC'}
          </Text>
        </Text>

        <Pressable /* onPress={() => setUnit(unit === 'BTC' ? 'Sats' : 'BTC')} */>
          <GlassView isInteractive style={styles.unitButton}>
            <SwapIcon
              size={16}
              color={alpha(colors.textSecondary[isDark ? 'dark' : 'light'], 0.7)}
            />
          </GlassView>
        </Pressable>
      </View>
      {/* <Utxos utxos={utxos} /> */}
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
    // fontFamily: 'JetBrains Mono',
    fontWeight: '700',
    color: colors.textSecondary.light,
    textShadowColor: alpha(colors.text.light, 0.2),
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
  },
  balanceAmountDark: {
    color: colors.textSecondary.dark, // '#FFA500',
    textShadowColor: alpha(colors.text.dark, 0.2),
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 8,
  },
  balanceCurrency: {
    // padding: 16,
    fontSize: 24,
    fontWeight: '700',
    // color: colors.primary,
    color: colors.primary,
    textShadowColor: alpha(colors.primary, 0.6),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  balanceCurrencyDark: {
    // color: colors.primary,
    color: alpha(colors.textSecondary.dark, 0.85),
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
