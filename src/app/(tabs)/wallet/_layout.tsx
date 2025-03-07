import { Stack } from 'expo-router'
import { useColorScheme, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native'
import WalletProvider, { useWallet } from '@/features/wallet/wallet-provider'
import colors from '@/shared/theme/colors'

export default function WalletLayout() {
  return (
    <WalletProvider>
      <WalletScreens />
    </WalletProvider>
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

function WalletScreens() {
  const { wallet } = useWallet()

  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  return (
    <SafeAreaView style={[styles.container, isDark ? styles.darkContainer : styles.lightContainer]}>
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
            title: 'Wallet',
          }}
        />

        <Stack.Screen
          name="create"
          options={{
            title: 'Create wallet',
          }}
        />
        <Stack.Screen
          name="details"
          options={{
            title: wallet?.walletName || 'Wallet',
          }}
        />

        {/*  <Stack.Screen
            name="import"
            options={{
              title: 'Import wallet',
            }}
          /> */}
      </Stack>
    </SafeAreaView>
  )
}
