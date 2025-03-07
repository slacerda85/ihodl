import colors from '@/shared/theme/colors'
import { Stack } from 'expo-router'
import { SafeAreaView, StyleSheet, useColorScheme } from 'react-native'

export default function ModalsLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.darkContainer : styles.lightContainer]}>
      <Stack>
        <Stack.Screen
          name="auth"
          options={{
            headerShown: false,
            animation: 'fade_from_bottom',
          }}
        />
      </Stack>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  lightContainer: {
    backgroundColor: colors.background.light,
  },
  darkContainer: {
    backgroundColor: colors.background.dark,
  },
})
