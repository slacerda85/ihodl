import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { Link } from 'expo-router'
import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native'

export default function WalletActions() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ScrollView style={styles.container}>
      <Link
        href="/wallet/delete"
        style={[styles.button, styles.buttonFirst, styles.buttonLast, isDark && styles.buttonDark]}
      >
        <Text style={styles.text}>Delete wallet</Text>
      </Link>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
  },
  button: {
    backgroundColor: colors.modal.light,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  buttonDark: {
    backgroundColor: alpha(colors.modal.light, 0.05),
  },
  buttonFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  buttonLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
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
    color: colors.error,
    fontSize: 16,
    textAlign: 'center',
  },
  textDark: {
    color: '#fff',
  },
  walletBox: {
    backgroundColor: colors.modal.light,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  walletBoxDark: {
    backgroundColor: alpha(colors.modal.light, 0.05),
  },
})
