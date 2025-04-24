// import { StrictMode } from 'react'
import AuthProvider from '@/features/auth/AuthProvider'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import InactivityOverlay from '@/features/auth/InactivityOverlay'
import { useColorScheme } from 'react-native'
import colors from '@/shared/theme/colors'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import AuthScreen from '@/features/auth/AuthScreen'
// import WalletProvider from '@/features/wallet/WalletProvider'
import useWalletStore from '@/features/wallet/useWallet'

SplashScreen.preventAutoHideAsync()

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
})

export default function RootLayout() {
  const { loadWallets } = useWalletStore()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadResources = async () => {
      try {
        // Load any resources or data that you need before rendering the app
        loadWallets()
      } catch (e) {
        console.warn(e)
      } finally {
        setLoaded(true)
        // Hide the splash screen once the resources are loaded
        await SplashScreen.hideAsync()
      }
    }

    loadResources()
  }, [loadWallets])

  /* useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded]) */

  if (!loaded) {
    return null
  }

  return (
    <>
      <AuthProvider>
        {/* <WalletProvider> */}
        <Stack
          screenOptions={{
            animation: 'fade',
            headerShown: false,
            headerStyle: {
              backgroundColor: isDark ? colors.background.dark : colors.background.light,
            },
            contentStyle: {
              backgroundColor: isDark ? colors.background.dark : colors.background.light,
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
          />

          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              headerStyle: {
                backgroundColor: isDark ? colors.background.dark : colors.background.light,
              },
              contentStyle: {
                backgroundColor: isDark ? colors.background.dark : colors.background.light,
              },
            }}
          />
        </Stack>
        <InactivityOverlay />
        <AuthScreen />
        {/*  </WalletProvider> */}
      </AuthProvider>
      <StatusBar style="auto" />
    </>
  )
}
