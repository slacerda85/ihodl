// import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useHeaderHeight } from '@react-navigation/elements'
import { View, StyleSheet } from 'react-native'

export default function ScreenContainer({ children }: { children: React.ReactNode }) {
  const headerHeight = useHeaderHeight()
  const tabBarHeight = 0 // useBottomTabBarHeight()

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
    paddingLeft: 16,
    paddingRight: 16,
  },
  rootDark: {
    // backgroundColor: colors.background.dark,
  },
})
