import { useEffect, useState, StrictMode } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AppProviders } from '@/features/app/AppProviders'
import InactivityOverlay from '@/features/auth/InactivityOverlay'
import AuthScreen from '@/features/auth/AuthScreen'

SplashScreen.preventAutoHideAsync()

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
})

function AppContent() {
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
    <StrictMode>
      <AppProviders>
        <AppContent />
        <InactivityOverlay />
        <AuthScreen />
        <StatusBar style="auto" />
      </AppProviders>
    </StrictMode>
  )
}
