// import { StrictMode } from 'react'
import AuthProvider from '@/features/auth/AuthProvider'
import BlockchainProvider from '@/features/blockchain/BlockchainProvider'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import InactivityOverlay from '@/features/auth/InactivityOverlay'
import { useColorScheme } from 'react-native'
import colors from '@/ui/colors'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import AuthScreen from '@/features/auth/AuthScreen'
import useStorage from '@/features/storage'
import { useInitialize } from '@/features/storage'

SplashScreen.preventAutoHideAsync()

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
})

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const setColorMode = useStorage(state => state.setColorMode)
  const colorMode = useStorage(state => state.colorMode)

  // Initialize app data
  useInitialize()

  // Determine the effective color mode
  const effectiveColorMode = colorMode === 'auto' ? (colorScheme ?? 'light') : colorMode

  const defaultStyle = {
    backgroundColor: colors.background[effectiveColorMode],
  }

  const defaultScreenOptions = {
    headerShown: false,
    headerStyle: defaultStyle,
    contentStyle: defaultStyle,
  }

  const [loaded] = useState(true)

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded])

  if (!loaded) {
    return null
  }

  return (
    <BlockchainProvider>
      <AuthProvider>
        <Stack
          screenOptions={{
            // ...defaultScreenOptions,
            animation: 'fade',
            // headerTransparent: true,
          }}
        >
          <Stack.Screen
            name="index"
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
          />

          <Stack.Screen name="(tabs)" options={defaultScreenOptions} />
        </Stack>
        <InactivityOverlay />
        <AuthScreen />
        <StatusBar style="auto" />
      </AuthProvider>
    </BlockchainProvider>
  )
}
