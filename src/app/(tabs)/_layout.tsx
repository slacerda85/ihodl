import WalletTabIcon from '@/features/wallet/wallet-tab-icon'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { HapticTab } from '@/shared/ui/haptic-tab'
import { Tabs } from 'expo-router'
import { Platform, useColorScheme } from 'react-native'

export default function TabsLayout() {
  const colorScheme = useColorScheme()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        // tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
            backgroundColor:
              colorScheme === 'dark' ? colors.background.dark : colors.background.light,
            borderTopColor:
              colorScheme === 'dark'
                ? alpha(colors.border.dark, 0.2)
                : alpha(colors.border.light, 0.2),
            borderTopWidth: 1,
          },
          default: {
            backgroundColor:
              colorScheme === 'dark' ? colors.background.dark : colors.background.light,
            borderTopColor:
              colorScheme === 'dark'
                ? alpha(colors.border.dark, 0.2)
                : alpha(colors.border.light, 0.2),
            borderTopWidth: 1,
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
    </Tabs>
  )
}
