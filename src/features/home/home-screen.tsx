import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import { useAuth } from '@/features/auth/auth-provider'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { StyleSheet, Text, View, useColorScheme } from 'react-native'
import colors from '@/shared/theme/colors'

export default function HomeScreen() {
  const { authenticated } = useAuth()
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  useEffect(() => {
    setTimeout(() => {
      if (!authenticated) {
        router.push('/auth')
      } else {
        router.push('/wallet')
      }
    }, 1000)
  }, [authenticated, router])

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
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
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
})
