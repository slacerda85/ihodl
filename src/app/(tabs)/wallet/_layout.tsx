import { Link, Stack, useRouter } from 'expo-router'
import { useColorScheme, StyleSheet, Text, Pressable, Platform } from 'react-native'
import { SafeAreaView } from 'react-native'
import WalletProvider, { useWallet } from '@/features/wallet/wallet-provider'
import colors from '@/shared/theme/colors'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/features/auth/auth-provider'
import { SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import ManageWallets from '@/features/wallet/manage-wallets'

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
function HeaderLeft(
  modalOpen: boolean,
  setModalOpen: { (value: SetStateAction<boolean>): void; (open: boolean): void },
) {
  return (
    <Pressable style={{ padding: 8, borderRadius: 24 }} onPress={() => setModalOpen(true)}>
      <Ionicons name="wallet-outline" size={24} color={colors.primary} />
      <ManageWallets open={modalOpen} setOpen={setModalOpen} />
    </Pressable>
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
    <Pressable style={{ padding: 8 }} onPress={handleClose}>
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
  const [modalOpen, setModalOpen] = useState(false)
  const { selectedWalletId, wallets, loading: walletsLoading } = useWallet()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  // show headers only when there are wallets
  const showHeaders = useMemo(() => wallets.length > 0, [wallets])

  const getTitle = useCallback(() => {
    if (walletsLoading) {
      return 'Loading...'
    }
    const wallet = wallets.find(wallet => wallet.walletId === selectedWalletId)
    return wallet ? wallet.walletName : 'No wallets found'
  }, [selectedWalletId, wallets, walletsLoading])

  return (
    <SafeAreaView style={[styles.container, isDark ? styles.darkContainer : styles.lightContainer]}>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'default',
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
            headerLeft: showHeaders ? () => HeaderLeft(modalOpen, setModalOpen) : undefined,
            headerRight: showHeaders ? () => headerRight() : undefined,
            // headerShown: false,
            headerTitleAlign: 'center',
            title: getTitle(),
          }}
        />
        <Stack.Screen
          name="actions"
          options={{
            presentation: 'modal',
            title: 'Actions',
            // right action closes modal
            headerRight: () => <CloseModalButton />,
          }}
        />
        <Stack.Screen
          name="create"
          options={{
            presentation: 'modal',
            title: '',
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
        {/*  <Stack.Screen
          name="manage"
          options={{
            presentation: 'card',
            animation: Platform.OS === 'android' ? 'slide_from_left' : 'slide_from_bottom',
            title: '',
            headerRight: () => <CloseModalButton />,
            headerLeft: () => null,
          }}
        /> */}
        <Stack.Screen
          name="delete"
          options={{
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
