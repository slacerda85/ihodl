import { useAuth } from '@/features/auth/auth-provider'
import React from 'react'
import { Text, View, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native'
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import colors from '@/shared/theme/colors'

export default function AuthScreen() {
  const { auth } = useAuth()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <BitcoinLogo width={128} height={128} />
      <Text style={[styles.title, isDark && styles.titleDark]}>ihodl</Text>
      <TouchableOpacity onPress={auth} style={styles.button}>
        <Text>Authenticate</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
    justifyContent: 'center',
    alignItems: 'center',
  },
  containerDark: {
    backgroundColor: colors.background.dark,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 60,
    color: colors.textSecondary.light,
    marginTop: 16,
  },
  titleDark: {
    color: colors.textSecondary.dark,
  },
  loader: {
    marginTop: 16,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
})
