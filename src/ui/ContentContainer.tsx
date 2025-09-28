// import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
// import { useHeaderHeight } from '@react-navigation/elements'
import { View, StyleSheet } from 'react-native'

export default function ScreenContainer({ children }: { children: React.ReactNode }) {
  // const headerHeight = useHeaderHeight()
  // const tabBarHeight = useBottomTabBarHeight()

  return (
    <View
      style={{
        ...styles.root,
        paddingTop: 16,
        paddingBottom: 16,
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
