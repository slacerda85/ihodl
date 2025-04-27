import SettingsTabIcon from '@/features/settings/settings-tab-icon'
import TransactionsTabIcon from '@/features/transactions/TransactionsTabIcon'
import WalletTabIcon from '@/features/wallet/WalletTabIcon'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { HapticTab } from '@/shared/ui/haptic-tab'
import { BlurView } from 'expo-blur'
import { Tabs } from 'expo-router'
import { StyleSheet, useColorScheme } from 'react-native'

export default function TabsLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <Tabs
      screenOptions={{
        animation: 'shift',
        tabBarActiveTintColor: colors.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: () => (
          <BlurView
            intensity={100}
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: 'transparent',
            }}
          />
        ),
        tabBarStyle: {
          backgroundColor: 'transparent',
          position: 'absolute',
          borderTopColor: isDark
            ? alpha(colors.background.light, 0.1)
            : alpha(colors.background.dark, 0.1),
          borderTopWidth: 1,
          // height: Platform.OS === 'ios' ? 80 : 60,
        },
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarShowLabel: false,
          tabBarIcon: ({ color }) => <WalletTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          tabBarShowLabel: false,
          tabBarIcon: ({ color }) => <TransactionsTabIcon filled color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarShowLabel: false,
          tabBarIcon: ({ color }) => <SettingsTabIcon color={color} />,
        }}
      />
    </Tabs>
  )
}
