import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useHeaderHeight } from '@react-navigation/elements'
import { StyleSheet, useColorScheme, View } from 'react-native'

export default function ScreenContainer({ children }: { children: React.ReactNode }) {
  const headerHeight = useHeaderHeight()
  const tabBarHeight = useBottomTabBarHeight()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View
      style={[
        styles.root,
        isDark && styles.rootDark,
        {
          paddingTop: headerHeight,
          paddingBottom: tabBarHeight,
        },
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: 'transparent',
    flex: 1,
    padding: 16,
    gap: 32,
  },
  rootDark: {
    // backgroundColor: colors.background.dark,
  },
})
