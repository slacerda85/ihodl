import { Stack } from 'expo-router'
import colors from '@/ui/colors'
import { useSettings } from '@/features/store/useSettings'

export default function TransactionsLayout() {
  const { isDark } = useSettings()

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
          title: `Transactions`,
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
