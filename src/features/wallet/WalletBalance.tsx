import { View, Text, StyleSheet, useColorScheme, Pressable, ActivityIndicator } from 'react-native'
import colors from '@/ui/colors'
import SwapIcon from './SwapIcon'
import useStorage from '../storage'
import { formatBalance } from './utils'

export default function WalletBalance() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const loadingWallet = useStorage(state => state.loadingWalletState)
  const loadingTx = useStorage(state => state.tx.loadingTxState)
  const loading = loadingWallet || loadingTx
  const unit = useStorage(state => state.unit)
  const setUnit = useStorage(state => state.setUnit)
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

  if (loading) {
    return (
      <View style={styles.balanceSection}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
            {loadingWallet ? 'Loading wallet...' : 'Loading transactions...'}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.balanceSection}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}></View>

        <Text style={[styles.balanceAmount, isDark && styles.balanceAmountDark]}>
          {formatBalance(balance, unit)}
        </Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => setUnit(unit === 'BTC' ? 'Sats' : 'BTC')}
            style={styles.unitButton}
          >
            <View style={styles.unitContainer}>
              <Text style={styles.balanceCurrency}>{unit}</Text>
              <SwapIcon size={12} color={colors.primary} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}></View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  balanceSection: {
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
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.light,
  },
  balanceAmountDark: {
    color: colors.text.dark,
  },
  balanceCurrency: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
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
    borderRadius: 8,
    // backgroundColor: alpha(colors.primary, 0.1),
    padding: 4,
    alignItems: 'center',
  },
})
