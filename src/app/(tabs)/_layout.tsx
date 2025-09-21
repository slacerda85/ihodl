import SettingsTabIcon from '@/features/settings/SettingsTabIcon'
import TransactionsTabIcon from '@/features/transactions/TransactionsTabIcon'
import WalletTabIcon from '@/features/wallet/WalletTabIcon'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { HapticTab } from '@/ui/haptic-tab'
// import { BlurView } from 'expo-blur'
import { Tabs } from 'expo-router'
import { Platform, StyleSheet, useColorScheme, View } from 'react-native'

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
          // <BlurView
          //   experimentalBlurMethod="dimezisBlurView"
          //   intensity={100}
          //   style={{
          //     ...StyleSheet.absoluteFillObject,
          //     backgroundColor: 'transparent',
          //     borderTopWidth: 1,
          //     borderTopColor: isDark
          //       ? alpha(colors.background.light, 0.1)
          //       : alpha(colors.background.dark, 0.1),
          //   }}
          //   tint={isDark ? 'dark' : 'light'}
          // />
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)',
              borderTopWidth: 1,
              borderTopColor: isDark
                ? alpha(colors.background.light, 0.1)
                : alpha(colors.background.dark, 0.1),
            }}
          />
        ),
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
            borderTopWidth: 0,
          },
          android: {
            backgroundColor: 'transparent',
            borderTopWidth: 0,
          },
        }),
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarShowLabel: true,
          tabBarIcon: ({ color, focused }) => <WalletTabIcon color={color} filled={focused} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          tabBarShowLabel: true,
          tabBarIcon: ({ color, focused }) => <TransactionsTabIcon color={color} filled />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarShowLabel: true,
          tabBarIcon: ({ color, focused }) => <SettingsTabIcon color={color} filled={focused} />,
        }}
      />
    </Tabs>
  )
}
