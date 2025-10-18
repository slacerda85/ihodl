// import { StrictMode } from 'react'
import AuthProvider from '@/features/auth/AuthProvider'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import InactivityOverlay from '@/features/auth/InactivityOverlay'
import { useColorScheme } from 'react-native'
import colors from '@/ui/colors'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import AuthScreen from '@/features/auth/AuthScreen'
import { StoreProvider, useSettings } from '@/features/store'

SplashScreen.preventAutoHideAsync()

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
})

function AppContent() {
  const { colorMode } = useSettings()
  const colorScheme = useColorScheme()
  const effectiveColorMode = colorMode === 'auto' ? (colorScheme ?? 'light') : colorMode

  const defaultStyle = {
    backgroundColor: colors.background[effectiveColorMode],
  }

  const defaultScreenOptions = {
    headerShown: false,
    headerStyle: defaultStyle,
    contentStyle: defaultStyle,
  }

  return (
    <Stack
      screenOptions={{
        animation: 'fade',
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
      />

      <Stack.Screen name="(tabs)" options={defaultScreenOptions} />
    </Stack>
  )
}

export default function RootLayout() {
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
    <StoreProvider>
      <AuthProvider>
        <AppContent />
        <InactivityOverlay />
        <AuthScreen />
        <StatusBar style="auto" />
      </AuthProvider>
    </StoreProvider>
  )
}
