// import { StrictMode } from 'react'
import AuthProvider from '@/features/auth/auth-provider'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import InactivityOverlay from '@/features/auth/inactivity-overlay'
import { useColorScheme } from 'react-native'
import colors from '@/shared/theme/colors'

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <>
      <AuthProvider>
        <Stack
          screenOptions={{
            animation: 'fade',
            headerShown: false,
            headerStyle: {
              backgroundColor: isDark ? colors.background.dark : colors.background.light,
            },
            contentStyle: {
              backgroundColor: isDark ? colors.background.dark : colors.background.light,
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
          />
          {/* <Stack.Screen
            name="(modals)"
            options={{
              headerShown: false,
              animation: 'fade',
              headerStyle: {
                backgroundColor: isDark ? colors.background.dark : colors.background.light,
              },
              contentStyle: {
                backgroundColor: isDark ? colors.background.dark : colors.background.light,
              },
            }}
          /> */}
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              headerStyle: {
                backgroundColor: isDark ? colors.background.dark : colors.background.light,
              },
              contentStyle: {
                backgroundColor: isDark ? colors.background.dark : colors.background.light,
              },
            }}
          />
        </Stack>
        <InactivityOverlay />
      </AuthProvider>
      <StatusBar style="auto" />
    </>
  )
}
