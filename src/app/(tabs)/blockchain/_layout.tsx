import { Stack } from 'expo-router'
import colors from '@/ui/colors'
import { useIsDark } from '@/ui/features/app-provider'

export default function BlockchainLayout() {
  const isDark = useIsDark()

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: {
          backgroundColor: colors.background[isDark ? 'dark' : 'light'],
        },
        contentStyle: {
          backgroundColor: colors.background[isDark ? 'dark' : 'light'],
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitleAlign: 'center',
          title: 'Blockchain',
        }}
      />
    </Stack>
  )
}
