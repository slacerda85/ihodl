import { View, Text, StyleSheet, useColorScheme, Pressable, ActivityIndicator } from 'react-native'
import colors from '@/shared/theme/colors'
import SwapIcon from './SwapIcon'
import useWallet from './useWallet'
import { useState } from 'react'

export default function WalletBalance() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const [useSatoshis, setUseSatoshis] = useState<boolean>(false)
  const toggleUnit = () => {
    setUseSatoshis(prev => !prev)
  }
  const balance = useSatoshis ? '0.00000000 BTC' : '0.00 BTC' // Placeholder for actual balance

  const {
    wallets,
    selectedWalletId /* selectedWallet, loadingBalance, useSatoshis = , toggleUnit, balance */,
  } = useWallet()
  const selectedWallet = wallets.find(wallet => wallet.walletId === selectedWalletId)

  /* if (loadingBalance) {
    return (
      <View style={styles.balanceSection}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  } */

  if (!selectedWallet) {
    return (
      <View style={styles.balanceSection}>
        <Text style={[styles.balanceLabel, isDark && styles.balanceLabelDark]}>
          No wallet selected
        </Text>
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

        <Text style={[styles.balanceAmount, isDark && styles.balanceAmountDark]}>{balance}</Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={toggleUnit} style={styles.unitButton}>
            <View style={styles.unitContainer}>
              <Text style={styles.balanceCurrency}>{useSatoshis ? 'Sats' : 'BTC'}</Text>
              <SwapIcon size={24} color={colors.primary} />
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
    // gap: 2,
  },
  unitButton: {
    borderRadius: 8,
    // backgroundColor: alpha(colors.primary, 0.1),
    padding: 4,
    alignItems: 'center',
  },
})
