import AuthProvider from '@/features/auth/AuthProvider'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import InactivityOverlay from '@/features/auth/InactivityOverlay'
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
  const { isDark } = useSettings()

  return (
    <>
      <Stack>
        <Stack.Screen
          name="index"
          options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
        />

        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
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
      </AuthProvider>
    </StoreProvider>
  )
}
