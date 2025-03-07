import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import { useAuth } from '@/features/auth/auth-provider'
import { useEffect } from 'react'
import { StyleSheet, Text, View, useColorScheme } from 'react-native'
import colors from '@/shared/theme/colors'
import { router } from 'expo-router'

export default function HomeScreen() {
  const { authenticated, auth } = useAuth()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  useEffect(() => {
    // Only trigger authentication if not already authenticated
    if (!authenticated) {
      auth().then(success => {
        if (success) {
          // Navigate to the wallet details screen
          router.push('/wallet')
        }
      })
    }
  }, [authenticated, auth])

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
    alignItems: 'center',
    justifyContent: 'center',
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
})
