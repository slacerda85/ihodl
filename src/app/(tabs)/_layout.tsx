import SettingsTabIcon from '@/features/settings/settings-tab-icon'
import WalletTabIcon from '@/features/wallet/WalletTabIcon'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { HapticTab } from '@/shared/ui/haptic-tab'
import { BlurView } from 'expo-blur'
import { Tabs } from 'expo-router'
import { Platform, useColorScheme } from 'react-native'

export default function TabsLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: () => <BlurView intensity={100} />,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
            backgroundColor: isDark ? colors.background.dark : colors.background.light,
            borderTopColor: isDark
              ? alpha(colors.background.light, 0.05)
              : alpha(colors.background.dark, 0.05),
            // borderTopWidth: 1,
          },
          default: {
            backgroundColor: isDark ? colors.background.dark : colors.background.light,

            /* borderTopColor: isDark
              ? alpha(colors.background.light, 0.05)
              : alpha(colors.background.dark, 0.05), */
            // borderTopWidth: 1,
            alignItems: 'center',
          },
        }),
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarShowLabel: false,
          tabBarIcon: ({ color }) => <WalletTabIcon color={color} />,
        }}
      />
      {/* <Tabs.Screen
        name="transactions"
        options={{
          tabBarShowLabel: false,
          tabBarIcon: ({ color }) => <WalletTabIcon color={color} />,
        }}
      /> */}
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
