import { Link, Stack, useRouter } from 'expo-router'
import { useColorScheme, StyleSheet, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native'
import WalletProvider, { useWallet } from '@/features/wallet/WalletProvider'
import colors from '@/shared/theme/colors'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/features/auth/auth-provider'
import { useCallback, useEffect, useMemo } from 'react'

export default function WalletLayout() {
  return (
    <WalletProvider>
      <WalletScreens />
    </WalletProvider>
  )
}

function headerRight() {
  return (
    <Link style={{ padding: 8, borderRadius: 24 }} href="/wallet/actions">
      <Ionicons name="ellipsis-vertical" size={24} color={colors.primary} />
    </Link>
  )
}

// link to [id]/manage
function headerLeft() {
  return (
    <Link style={{ padding: 8, borderRadius: 24 }} href="/wallet/manage">
      <Ionicons name="wallet-outline" size={24} color={colors.primary} />
    </Link>
  )
}

const CloseModalButton = () => {
  const router = useRouter()
  const { inactive } = useAuth()

  const handleClose = useCallback(() => {
    router.back()
  }, [router])

  useEffect(() => {
    if (inactive) {
      handleClose()
    }
  }, [inactive, handleClose])
  return (
    <Pressable
      style={{ paddingVertical: 8, paddingLeft: 16, paddingRight: 8 }}
      onPress={handleClose}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: 'bold',
          color: colors.primary,
          // padding: 8,
        }}
      >
        Done
      </Text>
    </Pressable>
  )
}

function WalletScreens() {
  const { selectedWalletId, wallets } = useWallet()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  // show headers only when there are wallets
  const showHeaders = useMemo(() => wallets !== undefined, [wallets])

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
          contentStyle: {
            backgroundColor: colors.background[isDark ? 'dark' : 'light'],
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerLeft: showHeaders ? () => headerLeft() : undefined,
            headerRight: showHeaders ? () => headerRight() : undefined,
            // headerShown: false,
            headerTitleAlign: 'center',
            title:
              wallets?.find(wallet => wallet.walletId === selectedWalletId)?.walletName ||
              'No wallets found',
          }}
        />
        <Stack.Screen
          name="actions"
          options={{
            presentation: 'modal',
            title: 'Actions',
            headerStyle: {
              backgroundColor: colors.modal[isDark ? 'dark' : 'light'],
            },
            contentStyle: {
              backgroundColor: colors.modal[isDark ? 'dark' : 'light'],
            },
            // right action closes modal
            headerRight: () => <CloseModalButton />,
          }}
        />
        <Stack.Screen
          name="create"
          options={{
            presentation: 'modal',
            title: '',
            headerStyle: {
              backgroundColor: colors.modal[isDark ? 'dark' : 'light'],
            },
            contentStyle: {
              backgroundColor: colors.modal[isDark ? 'dark' : 'light'],
            },
            headerRight: () => <CloseModalButton />,
          }}
        />
        <Stack.Screen
          name="import"
          options={{
            presentation: 'modal',
            title: '',
            headerRight: () => <CloseModalButton />,
          }}
        />
        <Stack.Screen
          name="manage"
          options={{
            headerStyle: {
              backgroundColor: colors.background[isDark ? 'dark' : 'light'],
            },
            contentStyle: {
              backgroundColor: colors.background[isDark ? 'dark' : 'light'],
            },
            presentation: 'modal',
            title: 'Manage wallets',
            headerRight: () => <CloseModalButton />,
          }}
        />
        <Stack.Screen
          name="delete"
          options={{
            headerStyle: {
              backgroundColor: colors.modal[isDark ? 'dark' : 'light'],
            },
            contentStyle: {
              backgroundColor: colors.modal[isDark ? 'dark' : 'light'],
            },
            presentation: 'modal',
            animation: 'fade',
            title: '',
            // headerRight: () => <CloseModalButton />,
          }}
        />

        {/* <Stack.Screen
          name="transactions"
          options={{
            title: 'Transactions',
          }}
        /> */}
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
