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

SplashScreen.preventAutoHideAsync()

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
})

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const defaultStyle = {
    backgroundColor: isDark ? colors.background.dark : colors.background.light,
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
  )
}
