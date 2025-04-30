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
      style={{
        ...styles.root,
        paddingTop: headerHeight + 16,
        paddingBottom: tabBarHeight + 16,
      }}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    flex: 1,
    gap: 32,
  },
  rootDark: {
    // backgroundColor: colors.background.dark,
  },
})
