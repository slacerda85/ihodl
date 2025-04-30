import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useHeaderHeight } from '@react-navigation/elements'
import { SafeAreaView, StyleSheet, View } from 'react-native'

export default function ScreenContainer({ children }: { children: React.ReactNode }) {
  const headerHeight = useHeaderHeight()
  const tabBarHeight = useBottomTabBarHeight()

  return (
    <SafeAreaView
      style={{
        ...styles.root,
        paddingTop: headerHeight + 16,
        paddingBottom: tabBarHeight + 16,
      }}
    >
      {children}
    </SafeAreaView>
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
