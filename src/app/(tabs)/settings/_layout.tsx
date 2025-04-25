import colors from '@/shared/theme/colors'
import { Stack } from 'expo-router'
import { useColorScheme, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native'

export default function WalletLayout() {
  return <SettingsScreens />
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})

function SettingsScreens() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  return (
    <SafeAreaView style={styles.root}>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTintColor: colors.primary,
          headerStyle: {
            backgroundColor: colors.background[isDark ? 'dark' : 'light'],
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            title: 'Settings',
            headerStyle: {
              backgroundColor: isDark ? colors.background.dark : colors.background.light,
            },
            contentStyle: {
              backgroundColor: isDark ? colors.background.dark : colors.background.light,
            },
          }}
        />
      </Stack>
    </SafeAreaView>
  )
}
