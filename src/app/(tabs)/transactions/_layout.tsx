import { Link, Stack } from 'expo-router'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useColorScheme } from 'react-native'
import colors from '@/ui/colors'

export default function TransactionsLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  // link to [id]/manage
  function headerLeft() {
    return (
      <Link style={{ padding: 8, borderRadius: 24 }} href="/wallet">
        <MaterialIcons name="arrow-back-ios" size={24} color={colors.primary} />
      </Link>
    )
  }

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
          headerTitleAlign: 'center',
          title: `Transactions`,
          headerLeft: () => headerLeft(),
        }}
      />
    </Stack>
  )
}
