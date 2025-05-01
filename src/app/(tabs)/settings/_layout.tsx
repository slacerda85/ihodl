import colors from '@/ui/colors'
import { Stack } from 'expo-router'
import { useColorScheme } from 'react-native'

export default function WalletLayout() {
  return <SettingsScreens />
}

function SettingsScreens() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: colors.primary,
        headerBlurEffect: isDark ? 'dark' : 'light',
        headerTransparent: true,
        contentStyle: {
          backgroundColor: colors.background[isDark ? 'dark' : 'light'],
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          title: 'Settings',
          /* headerStyle: {
            backgroundColor: isDark ? colors.background.dark : colors.background.light,
          },
          contentStyle: {
            backgroundColor: isDark ? colors.background.dark : colors.background.light,
          }, */
        }}
      />
    </Stack>
  )
}
