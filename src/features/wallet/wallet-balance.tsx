import { View, Text, StyleSheet, useColorScheme } from 'react-native'
import colors from '@/shared/theme/colors'
interface WalletBalanceProps {
  balance: number
  isLoading: boolean
}

export default function WalletBalance({ balance, isLoading }: WalletBalanceProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View style={styles.balanceSection}>
      <Text style={[styles.balanceLabel, isDark && styles.balanceLabelDark]}>Balance</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text> </Text>
        <Text style={[styles.balanceAmount, isDark && styles.balanceAmountDark]}>
          {balance.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}
        </Text>
        <Text style={styles.balanceCurrency}>BTC</Text>
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
})
