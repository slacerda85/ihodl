import { StrictMode, useEffect, useMemo, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import InactivityOverlay from '@/ui/features/auth/InactivityOverlay'
import AuthScreen from '@/ui/features/auth/AuthScreen'
import ErrorBoundary from '@/ui/components/ErrorBoundary'
import AppProvider from '@/ui/features/app-provider'
import WalletChangeHandler from '@/ui/features/wallet/WalletChangeHandler'
import { useActiveWalletId, useWalletActions } from '@/ui/features/app-provider/AppProvider'
import { useLightningStartupWorker } from '@/ui/hooks/use-lightning-worker'
import { isLightningWorkerEnabled } from '@/config/feature-flags'

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

function LightningWorkerBootstrap() {
  const activeWalletId = useActiveWalletId()
  const { getMasterKey } = useWalletActions()
  const masterKey = useMemo(() => {
    if (!activeWalletId) return undefined
    try {
      return getMasterKey(activeWalletId)
    } catch (err) {
      console.warn('[LightningWorkerBootstrap] Failed to get master key:', err)
      return undefined
    }
  }, [activeWalletId, getMasterKey])

  useLightningStartupWorker({ walletId: activeWalletId, masterKey, autoStart: true })

  return null
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
          {isLightningWorkerEnabled() ? <LightningWorkerBootstrap /> : null}
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
