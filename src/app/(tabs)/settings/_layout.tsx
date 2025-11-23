import { useSettings } from '@/ui/features/settings'
import colors from '@/ui/colors'
import { Stack } from 'expo-router'

export default function WalletLayout() {
  return <SettingsScreens />
}

function SettingsScreens() {
  const { isDark } = useSettings()
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTransparent: true,
        headerTintColor: isDark ? colors.text.dark : colors.text.light,
        contentStyle: {
          backgroundColor: colors.background[isDark ? 'dark' : 'light'],
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
        }}
      />
    </Stack>
  )
}
