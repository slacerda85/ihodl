import { View, Text, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native'
import colors from '@/shared/theme/colors'
import { useState } from 'react'
import SwapIcon from './SwapIcon'
import { alpha } from '@/shared/theme/utils'

interface WalletBalanceProps {
  balance: number
  isLoading: boolean
}

export default function WalletBalance({ balance, isLoading }: WalletBalanceProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const [useSatoshis, setUseSatoshis] = useState(false)

  // Convert balance to satoshis or keep as BTC based on state
  const displayBalance = useSatoshis ? balance * 100000000 : balance

  // Format balance appropriately for each unit
  const formattedBalance = useSatoshis
    ? Math.round(displayBalance)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : balance.toLocaleString('pt-BR', { maximumFractionDigits: 8 })

  const toggleUnit = () => {
    setUseSatoshis(prev => !prev)
  }

  return (
    <View style={styles.balanceSection}>
      {/* <Text style={[styles.balanceLabel, isDark && styles.balanceLabelDark]}>Balance</Text> */}
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
          {formattedBalance}
        </Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={toggleUnit} style={styles.unitButton}>
            <View style={styles.unitContainer}>
              <Text style={styles.balanceCurrency}>{useSatoshis ? 'Sats' : 'BTC'}</Text>
              <SwapIcon size={24} color={colors.primary} />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}></View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
})
