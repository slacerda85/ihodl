import { Stack } from 'expo-router'
import colors from '@/ui/colors'
import { useSettings } from '@/features/storage'
// import useStorage from '@/features/storage'

export default function BlockchainLayout() {
  const { isDark } = useSettings()

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
