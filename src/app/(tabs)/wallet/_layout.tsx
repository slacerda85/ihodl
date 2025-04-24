import { Link, Stack, useRouter } from 'expo-router'
import { useColorScheme, StyleSheet, Text, Pressable, Platform } from 'react-native'
import { SafeAreaView } from 'react-native'
import useWallet from '@/features/wallet/useWallet'
import colors from '@/shared/theme/colors'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCallback, useEffect } from 'react'
import ManageWalletsIcon from '@/features/wallet/ManageWalletsIcon'

export default function WalletLayout() {
  return <WalletScreens />
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
      <ManageWalletsIcon color={colors.primary} />
      {/* <Ionicons name="wallet-outline" size={24} color={colors.primary} /> */}
    </Link>
  )
}

const CloseModalButton = ({ title }: { title?: string }) => {
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
          // fontWeight: 'bold',
          color: colors.primary,
          // padding: 8,
        }}
      >
        {title || 'Close'}
      </Text>
    </Pressable>
  )
}

function WalletScreens() {
  const { selectedWalletId, wallets } = useWallet()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  // show headers only when there are wallets
  // const showHeaders = useMemo(() => wallets !== undefined, [wallets])

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
            headerLeft: () => headerLeft(),
            headerRight: selectedWalletId ? () => headerRight() : undefined,
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
            headerStyle: {
              backgroundColor: colors.background[isDark ? 'dark' : 'light'],
            },
            contentStyle: {
              backgroundColor: colors.background[isDark ? 'dark' : 'light'],
            },
            presentation: 'modal',
            animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
            title: 'Wallet actions',
            headerRight:
              Platform.OS === 'ios' ? () => <CloseModalButton title="Done" /> : undefined,
          }}
        />
        <Stack.Screen
          name="create"
          options={{
            headerStyle: {
              backgroundColor: colors.background[isDark ? 'dark' : 'light'],
            },
            contentStyle: {
              backgroundColor: colors.background[isDark ? 'dark' : 'light'],
            },
            presentation: Platform.select({
              ios: 'modal',
              default: 'modal',
            }),
            animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
            title: 'Create wallet',
            headerRight:
              Platform.OS === 'ios' ? () => <CloseModalButton title="Cancel" /> : undefined,
          }}
        />
        <Stack.Screen
          name="import"
          options={{
            presentation: 'modal',
            title: 'Import wallet',
            headerRight: () => <CloseModalButton title="Cancel" />,
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
            presentation: Platform.select({
              ios: 'modal',
              default: 'transparentModal',
            }),
            animation: Platform.OS === 'android' ? 'slide_from_left' : undefined,
            title: 'Manage wallets',
            headerRight:
              Platform.OS === 'ios' ? () => <CloseModalButton title="Done" /> : undefined,
          }}
        />
        <Stack.Screen
          name="delete"
          options={{
            headerStyle: {
              backgroundColor: colors.background[isDark ? 'dark' : 'light'],
            },
            contentStyle: {
              backgroundColor: colors.background[isDark ? 'dark' : 'light'],
            },
            presentation: Platform.select({
              ios: 'modal',
              default: 'transparentModal',
            }),
            animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
            title: 'Delete wallet',
            headerRight: Platform.OS === 'ios' ? () => <CloseModalButton /> : undefined,
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
