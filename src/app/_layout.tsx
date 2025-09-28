// import { StrictMode } from 'react'
import AuthProvider from '@/features/auth/AuthProvider'
import { Stack } from 'expo-router'
// import { StatusBar } from 'expo-status-bar'
import InactivityOverlay from '@/features/auth/InactivityOverlay'
// import { useColorScheme } from 'react-native'
// import colors from '@/ui/colors'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import AuthScreen from '@/features/auth/AuthScreen'
// import useStorage from '@/features/storage'
import 'react-native-reanimated'

SplashScreen.preventAutoHideAsync()

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
})

export const unstable_settings = {
  anchor: '(tabs)',
}

export default function RootLayout() {
  // const colorScheme = useColorScheme()
  // const setColorMode = useStorage(state => state.setColorMode)
  // const colorMode = useStorage(state => state.colorMode)

  // Set the color mode based on the system preference
  /* useEffect(() => {
    setColorMode(colorScheme ?? 'light')
  }, [colorScheme, setColorMode]) */

  /* const defaultStyle = {
    backgroundColor: colors.background[colorMode],
  } */

  const defaultScreenOptions = {
    headerShown: false,
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
      /* screenOptions={{
          animation: 'fade',          
        }} */
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false /* contentStyle: { backgroundColor: 'transparent' } */ }}
        />

        <Stack.Screen name="(tabs)" options={defaultScreenOptions} />
      </Stack>
      <InactivityOverlay />
      <AuthScreen />
      {/* <StatusBar style="auto" /> */}
    </AuthProvider>
  )
}
