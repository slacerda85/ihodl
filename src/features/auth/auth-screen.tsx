import { useAuth } from '@/features/auth/auth-provider'
import React, { useEffect } from 'react'
import { Text, View, StyleSheet, useColorScheme } from 'react-native'
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import colors from '@/shared/theme/colors'

export default function AuthScreen() {
  const { authAndRedirect, authenticated } = useAuth()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  useEffect(() => {
    // Only trigger authentication if not already authenticated
    if (!authenticated) {
      authAndRedirect()
    }
  }, [authenticated, authAndRedirect])

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <BitcoinLogo width={128} height={128} />
      <Text style={[styles.title, isDark && styles.titleDark]}>ihodl</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  title: {
    fontWeight: 'bold',
    fontSize: 60,
    color: colors.textSecondary.light,
    marginTop: 16,
  },
  titleDark: {
    color: colors.textSecondary.dark || '#e0e0e0', // Fallback if dark theme color not defined
  },
  loader: {
    marginTop: 16,
  },
})
