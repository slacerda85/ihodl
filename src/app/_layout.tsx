import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AppProviders } from '@/features/app/AppProviders'
import InactivityOverlay from '@/features/auth/InactivityOverlay'
import AuthScreen from '@/features/auth/AuthScreen'
import { useAppInitialization } from '@/features/app/useAppInitialization'

SplashScreen.preventAutoHideAsync()

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
})

function AppContent() {
  const { isInitializing, error } = useAppInitialization()

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <Stack>
        <Stack.Screen name="loading" options={{ headerShown: false }} />
      </Stack>
    )
  }

  // Show error state if initialization failed
  if (error) {
    console.error('[App] Initialization error:', error)
    // You could show an error screen here
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
    <AppProviders>
      <AppContent />
      <InactivityOverlay />
      <AuthScreen />
      <StatusBar style="auto" />
    </AppProviders>
  )
}
