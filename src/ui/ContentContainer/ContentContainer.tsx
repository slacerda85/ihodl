import { useHeaderHeight } from '@react-navigation/elements'
import { View, StyleSheet } from 'react-native'
// import { SafeAreaView } from 'react-native-safe-area-context'

export default function ContentContainer({ children }: { children: React.ReactNode }) {
  const headerHeight = useHeaderHeight()

  return <View style={[styles.container, { paddingTop: headerHeight }]}>{children}</View>
}

const styles = StyleSheet.create({
  container: {
    // paddingTop: 16,
    paddingHorizontal: 16,
    flex: 1,
  },
})
