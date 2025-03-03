import { Stack } from 'expo-router'
import { useColorScheme, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native'
import WalletProvider from '@/features/wallet/wallet-provider'
import colors from '@/shared/theme/colors'

export default function WalletLayout() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  return (
    <WalletProvider>
      <SafeAreaView
        style={[styles.container, isDark ? styles.darkContainer : styles.lightContainer]}
      >
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerTintColor: colors.primary,
            headerStyle: {
              backgroundColor: colorScheme === 'dark' ? colors.black : colors.white,
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              headerShown: false,
              title: 'Wallet',
            }}
          />

          <Stack.Screen
            name="create"
            options={{
              title: 'Create wallet',
            }}
          />

          {/* <Stack.Screen
            name="details"
            options={{
              title: 'Wallet details',
            }}
          />

          <Stack.Screen
            name="import"
            options={{
              title: 'Import wallet',
            }}
          /> */}
        </Stack>
      </SafeAreaView>
    </WalletProvider>
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
