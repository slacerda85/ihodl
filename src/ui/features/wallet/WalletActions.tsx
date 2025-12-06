import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { Link } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useIsDark } from '@/ui/features/app-provider'

export default function WalletActions() {
  const isDark = useIsDark()

  return (
    <View style={styles.container}>
      {/* Seed phrase */}
      <View>
        <Link
          href="/wallet/seed"
          style={[
            styles.button,
            styles.buttonFirst,
            styles.buttonLast,
            isDark && styles.buttonDark,
          ]}
        >
          <Text style={[styles.text, isDark && styles.textDark]}>View seed phrase</Text>
        </Link>
      </View>
      {/* delete */}
      <View>
        <Link
          href="/wallet/delete"
          style={[
            styles.button,
            styles.buttonFirst,
            styles.buttonLast,
            isDark && styles.buttonDark,
          ]}
        >
          <Text style={[styles.text, styles.errorText]}>Delete wallet</Text>
        </Link>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flexDirection: 'column',
    gap: 16,
  },
  button: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  buttonDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  buttonFirst: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  buttonLast: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  wrapper: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: alpha(colors.black, 0.2),
  },
  wrapperDark: {
    backgroundColor: alpha(colors.white, 0.2),
  },
  text: {
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    color: colors.error,
  },
  textDark: {
    color: colors.text.dark,
  },
  walletBox: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  walletBoxDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
})
