import { Stack } from 'expo-router'
// import { useColorScheme } from 'react-native'
import colors from '@/ui/colors'
import { useSettings } from '@/features/store'
// import useStorage from '@/features/storage'

export default function BlockchainLayout() {
  const { colorMode } = useSettings()
  const isDark = colorMode === 'dark'

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: true,
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
          headerTitleAlign: 'center',
          title: 'Blockchain',
        }}
      />
    </Stack>
  )
}
