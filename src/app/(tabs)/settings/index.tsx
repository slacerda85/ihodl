import colors from '@/ui/colors'
import ScreenContainer from '@/ui/ScreenContainer'
import { Text, StyleSheet, useColorScheme } from 'react-native'

export default function SettingsRoute() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ScreenContainer>
      <Text style={[styles.title, isDark && styles.titleDark]}>Settings</Text>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  titleDark: {
    color: colors.text.dark,
  },
})
