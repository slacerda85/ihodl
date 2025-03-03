import { useAuth } from '@/features/auth/auth-provider'
import React, { useEffect } from 'react'
import { Text, View, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import colors from '@/shared/theme/colors'

export default function AuthScreen() {
  const { auth, authenticated, setInactive } = useAuth()
  const router = useRouter()

  useEffect(() => {
    const handleAuth = async () => {
      auth().then(response => {
        if (!response) {
          console.log('Authentication failed')
        }
      })
    }

    setInactive(false)

    if (authenticated) {
      // go back to previous screen
      router.back()
      setInactive(false)
    } else {
      handleAuth()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  return (
    <View style={styles.container}>
      <BitcoinLogo width={128} height={128} />
      <Text style={styles.title}>ihodl</Text>
      {authenticated ? (
        <ActivityIndicator size="large" color="#F7931A" style={styles.loader} />
      ) : null}
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
  title: {
    fontWeight: 'bold',
    fontSize: 60,
    color: colors.textSecondary.light,
    marginTop: 16,
  },
  loader: {
    marginTop: 16,
  },
})
