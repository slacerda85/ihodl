import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import { useState, useEffect, useCallback } from 'react'
import colors from '@/ui/colors'
import SwapIcon from './SwapIcon'
import { useWallet } from '@/features/wallet'
import { useTransactions } from '@/features/transactions'
import { useSettings } from '@/features/settings'
import { formatBalance } from './utils'
import { alpha } from '@/ui/utils'
import { GlassView } from 'expo-glass-effect'

export default function WalletBalance() {
  const { isDark } = useSettings()

  const [balance, setBalance] = useState(0)
  const { friendly } = useTransactions()
  const { loading: loadingWallet, unit, activeWalletId, dispatch: walletDispatch } = useWallet()
  const loading = loadingWallet || false
  // Calculate balance from cached transactions
  const getBalance = useCallback(
    (walletId: string) => {
      const walletCache = friendly.find(cache => cache.walletId === walletId)
      if (!walletCache) return 0

      // Calculate balance from friendly transactions
      return friendly.reduce((total, tx) => {
        if (tx.type === 'received') {
          return total + tx.amount
        } else if (tx.type === 'sent') {
          return total - tx.amount
        }
        return total // for unknown types, don't change balance
      }, 0)
    },
    [friendly],
  )

  // Set unit function
  const setUnit = (newUnit: 'BTC' | 'Sats') => {
    walletDispatch({ type: 'SET_UNIT', payload: newUnit })
  }

  // Update balance when dependencies change
  useEffect(() => {
    if (activeWalletId) {
      try {
        // Use the getBalance selector from useTransactions
        const newBalance = getBalance(activeWalletId)
        setBalance(newBalance)
      } catch (error) {
        console.error('Error fetching balance:', error)
        setBalance(0)
      }
    } else {
      setBalance(0)
    }
  }, [activeWalletId, getBalance])

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
          {formatBalance(balance, unit)}
        </Text>
        <Pressable onPress={() => setUnit(unit === 'BTC' ? 'Sats' : 'BTC')}>
          <GlassView isInteractive style={styles.unitButton}>
            <Text style={[styles.balanceCurrency, isDark && styles.balanceCurrencyDark]}>
              {unit}
            </Text>
            <SwapIcon
              size={16}
              color={alpha(colors.textSecondary[isDark ? 'dark' : 'light'], 0.7)}
            />
          </GlassView>
        </Pressable>
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
    fontSize: 36,
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
    fontSize: 16,
    fontWeight: '700',
    // color: colors.primary,
    color: colors.textSecondary.light,
    /* textShadowColor: '#FF8C00',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8, */
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
})
