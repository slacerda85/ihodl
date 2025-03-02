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
    backgroundColor: 'white',
  },
  darkContainer: {
    backgroundColor: 'black',
  },
})
