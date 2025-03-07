import { useAuth } from '@/features/auth/auth-provider'
import React, { useEffect } from 'react'
import { Text, View, StyleSheet, useColorScheme } from 'react-native'
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import colors from '@/shared/theme/colors'

export default function AuthScreen() {
  const { unlockApp, authenticated } = useAuth()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  useEffect(() => {
    let mounted = true

    const attemptUnlock = async () => {
      if (!authenticated && mounted) {
        const success = await unlockApp()
        if (!success && mounted) {
          // If authentication failed, try again
          setTimeout(attemptUnlock, 0)
        }
      }
    }

    attemptUnlock()

    // Cleanup to prevent trying to update state after unmount
    return () => {
      mounted = false
    }
  }, [authenticated, unlockApp])

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
})
