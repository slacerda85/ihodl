import colors from '@/ui/colors'
import { View, Text, StyleSheet, useColorScheme } from 'react-native'

export default function SettingsRoute() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <View style={styles.container}>
      <Text style={[styles.title, isDark && styles.titleDark]}>Settings</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  titleDark: {
    color: colors.text.dark,
  },
})
