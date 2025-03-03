import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import { useAuth } from '@/features/auth/auth-provider'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import colors from '@/shared/theme/colors'

export default function HomeScreen() {
  const { authenticated } = useAuth()
  const router = useRouter()

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
    <View style={styles.container}>
      <BitcoinLogo width={128} height={128} />
      <Text style={styles.title}>ihodl</Text>
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
  title: {
    fontWeight: 'bold',
    fontSize: 60,
    color: colors.textSecondary.light,
    marginTop: 16,
  },
})
