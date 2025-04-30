import BitcoinLogo from '@/assets/bitcoin-logo'
import { useEffect } from 'react'
import { StyleSheet, Text, View, useColorScheme } from 'react-native'
import colors from '@/ui/colors'
import { router, useSegments } from 'expo-router'
import { useAuth } from '../auth/AuthProvider'

export default function HomeScreen() {
  const { authenticated } = useAuth()
  const segments = useSegments()
  const currentRoute = '/' + segments.join('/')
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  useEffect(() => {
    if (currentRoute === '/' && authenticated) {
      router.push('/(tabs)/wallet')
    }
  }, [authenticated, currentRoute])

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
    // backgroundColor: colors.background.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerDark: {
    // backgroundColor: colors.background.dark,
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
