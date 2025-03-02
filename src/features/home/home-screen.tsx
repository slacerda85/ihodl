import BitcoinLogo from '@/assets/bitcoin-logo'
import { useAuth } from '@/features/auth/auth-provider'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Path, G } from 'react-native-svg'

export default function HomeScreen() {
  const { authenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    setTimeout(() => {
      if (!authenticated) {
        router.push('/auth')
      } /* else {
        router.push('/')
      } */
    }, 1000)
  }, [authenticated, router])

  return (
    <View style={styles.container}>
      <BitcoinLogo width={128} height={128} />
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
})
