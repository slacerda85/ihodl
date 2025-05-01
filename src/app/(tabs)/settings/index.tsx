import colors from '@/ui/colors'
import ScreenContainer from '@/ui/ContentContainer'
import { Text, StyleSheet, useColorScheme, View } from 'react-native'

export default function SettingsRoute() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <ScreenContainer>
      <View>
        <Text style={[styles.title, isDark && styles.titleDark]}>Settings</Text>
      </View>
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
