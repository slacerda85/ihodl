import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { Link } from 'expo-router'
import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native'

export default function WalletActionsRoute() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ScrollView style={styles.container}>
      <Link href="/wallet/delete" style={[styles.wrapper, isDark && styles.wrapperDark]}>
        <Text style={styles.text}>Delete wallet</Text>
      </Link>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
  },
  wrapper: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
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
})
