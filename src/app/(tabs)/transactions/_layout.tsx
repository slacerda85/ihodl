import { Stack, useRouter } from 'expo-router'
import Button from '@/ui/Button'
import colors from '@/ui/colors'
import { useSettings } from '@/features/store/useSettings'
import { MaterialIcons } from '@expo/vector-icons'

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
          //  headerLeft: HeaderLeft,
        }}
      />
      <Stack.Screen
        name="[txid]"
        options={{
          headerTitleAlign: 'center',
          title: `Transaction Details`,

          // headerLeft: HeaderLeft,
        }}
      />
    </Stack>
  )
}
