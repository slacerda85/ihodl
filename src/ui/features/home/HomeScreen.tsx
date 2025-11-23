import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import colors from '@/ui/colors'
import { router, useSegments } from 'expo-router'
import { useAuth } from '../auth/AuthProvider'
import { useSettings } from '@/ui/features/settings'
import IHodlLogo from '@/ui/assets/ihodl-logo'

export default function HomeScreen() {
  const { authenticated } = useAuth()
  const segments = useSegments()
  const currentRoute = '/' + segments.join('/')
  const { isDark } = useSettings()

  useEffect(() => {
    if (currentRoute === '/' && authenticated) {
      router.push('/(tabs)/wallet')
    }
  }, [authenticated, currentRoute])

  return (
    <View style={styles.container}>
      <IHodlLogo width={128} height={128} />
      <Text style={[styles.title, isDark && styles.titleDark]}>ihodl</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
