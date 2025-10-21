import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import { useState, useEffect } from 'react'
import colors from '@/ui/colors'
import SwapIcon from './SwapIcon'
import { useWallet, useTransactions, useSettings } from '../store'
import { formatBalance } from './utils'
import { alpha } from '@/ui/utils'

export default function WalletBalance() {
  const { isDark } = useSettings()

  const [balance, setBalance] = useState(0)
  const { cachedTransactions, getBalance } = useTransactions()
  const { loadingWalletState: loadingWallet, unit, setUnit, activeWalletId } = useWallet()
  const { loadingTxState: loadingTx } = useTransactions()
  const loading = loadingWallet || loadingTx || false

  // Update balance when dependencies change
  useEffect(() => {
    if (activeWalletId) {
      try {
        // Use the getBalance selector from useTransactions
        const newBalance = getBalance(activeWalletId)
        setBalance(newBalance)
        console.log('[WalletBalance] Balance updated:', newBalance)
      } catch (error) {
        console.error('[WalletBalance] Error getting balance:', error)
        setBalance(0)
      }
    } else {
      setBalance(0)
    }
  }, [activeWalletId, cachedTransactions, getBalance])

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

        <Text style={[styles.balanceAmount /* , isDark && styles.balanceAmountDark */]}>
          {formatBalance(balance, unit)}
        </Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => setUnit(unit === 'BTC' ? 'Sats' : 'BTC')}
            style={styles.unitButton}
          >
            <View style={styles.unitContainer}>
              <Text style={styles.balanceCurrency}>{unit}</Text>
              <SwapIcon size={12} color={colors.textSecondary.dark} />
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
    color: '#FFA500',
    textShadowColor: '#FF8C00',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  balanceAmountDark: {
    color: colors.text.dark,
  },
  balanceCurrency: {
    // fontSize: 22,
    fontWeight: '700',
    // color: colors.primary,
    color: colors.textSecondary.dark,
    /* textShadowColor: '#FF8C00',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8, */
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
    paddingHorizontal: 16,
    backgroundColor: alpha(colors.background.light, 0.15),
    paddingVertical: 8,
    alignItems: 'center',
  },
})
