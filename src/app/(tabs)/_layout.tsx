import WalletTabIcon from '@/features/wallet/wallet-tab-icon'
import colors from '@/shared/theme/colors'
import { HapticTab } from '@/shared/ui/haptic-tab'
import { Tabs } from 'expo-router'
import { Platform } from 'react-native'

export default function TabsLayout() {
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
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color }) => <WalletTabIcon color={color} />,
        }}
      />
    </Tabs>
  )
}
