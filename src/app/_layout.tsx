// import { StrictMode } from 'react'
import AuthProvider from '@/features/auth/auth-provider'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import InactivityOverlay from '@/features/auth/inactivity-overlay'

export default function RootLayout() {
  return (
    <>
      <AuthProvider>
        <Stack
          screenOptions={{
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(modals)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <InactivityOverlay />
      </AuthProvider>
      <StatusBar style="auto" />
    </>
  )
}
