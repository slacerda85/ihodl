import { Stack } from 'expo-router'
import colors from '@/ui/colors'
import { useIsDark } from '@/ui/features/app-provider'
import { Platform } from 'react-native'

export default function TransactionsLayout() {
  const isDark = useIsDark()

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
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
          headerTitleAlign: 'center',
          title: 'Transactions',
          contentStyle: {
            paddingTop: Platform.OS === 'ios' ? 64 : 0,
          },
        }}
      />
      <Stack.Screen
        name="[txid]"
        options={{
          headerTitleAlign: 'center',
          title: `Transaction Details`,
        }}
      />
    </Stack>
  )
}
