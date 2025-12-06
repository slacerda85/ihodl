import { Stack } from 'expo-router'
import colors from '@/ui/colors'
import { useActiveColorMode } from '@/ui/features/settings'

export default function LightningLayout() {
  const colorMode = useActiveColorMode()

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: {
          backgroundColor: colors.background[colorMode],
        },
        contentStyle: {
          backgroundColor: colors.background[colorMode],
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitleAlign: 'center',
          title: 'Lightning dashboard',
        }}
      />
    </Stack>
  )
}
