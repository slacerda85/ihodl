import { StrictMode, useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import InactivityOverlay from '@/ui/features/auth/InactivityOverlay'
import AuthScreen from '@/ui/features/auth/AuthScreen'
import ErrorBoundary from '@/ui/components/ErrorBoundary'
import AppProvider from '@/ui/features/app-provider'
import WalletChangeHandler from '@/ui/features/wallet/WalletChangeHandler'

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
      <ErrorBoundary>
        <AppProvider>
          <WalletChangeHandler />
          <AppContent />
          <InactivityOverlay />
          <AuthScreen />
          <StatusBar style="auto" />
        </AppProvider>
      </ErrorBoundary>
    </StrictMode>
  )
}
