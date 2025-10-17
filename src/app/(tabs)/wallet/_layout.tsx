import { Link, Stack, useRouter } from 'expo-router'
import { useColorScheme, Text, Pressable, Platform } from 'react-native'
import colors from '@/ui/colors'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCallback, useEffect } from 'react'
import ManageWalletsIcon from '@/features/wallet/ManageWalletsIcon'
import useStorage from '@/features/storage'
import Button from '@/ui/Button/Button'
// import useStorage from '@/features/store'

function headerRight() {
  return (
    <Link href="/wallet/actions" asChild>
      <Pressable
        style={{
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="ellipsis-vertical" size={24} color={colors.primary} />
      </Pressable>
    </Link>
  )
}

// link to wallet/manage
function ManageWallets() {
  const router = useRouter()

  function handleManageWallets() {
    router.push('/wallet/manage' as any)
  }

  return (
    <Pressable
      onPress={handleManageWallets}
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ManageWalletsIcon color={colors.primary} size={24} />
    </Pressable>
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

export default function WalletLayout() {
  const activeWalletId = useStorage(state => state.activeWalletId)
  const wallets = useStorage(state => state.wallets)
  const selectedWallet = wallets?.find(wallet => wallet.walletId === activeWalletId)
  const empty = wallets === undefined || wallets?.length === 0

  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const modalOptions = {
    headerBlurEffect: undefined,
    headerTransparent: false,
    headerStyle: {
      backgroundColor: colors.background[isDark ? 'dark' : 'light'],
    },
    contentStyle: {
      backgroundColor: colors.background[isDark ? 'dark' : 'light'],
    },
  }

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: colors.primary,
        headerBlurEffect: isDark ? 'dark' : 'light',
        headerTransparent: true,
        contentStyle: {
          backgroundColor: colors.background[isDark ? 'dark' : 'light'],
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerBlurEffect: 'none',
          headerLeft: empty ? undefined : () => ManageWallets(),
          headerRight: activeWalletId ? () => headerRight() : undefined,
          headerTitleAlign: 'center',
          title: selectedWallet?.walletName || '',
        }}
      />
      <Stack.Screen
        name="actions"
        options={{
          ...modalOptions,
          presentation: Platform.select({
            ios: 'modal',
            default: 'transparentModal',
          }),
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Wallet actions',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton title="Done" /> : undefined,
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          ...modalOptions,
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
          ...modalOptions,
          presentation: 'modal',
          title: 'Import wallet',
          headerRight: () => <CloseModalButton title="Cancel" />,
        }}
      />
      <Stack.Screen
        name="manage"
        options={{
          ...modalOptions,
          presentation: Platform.select({
            ios: 'modal',
            default: 'transparentModal',
          }),
          animation: Platform.OS === 'android' ? 'slide_from_left' : undefined,
          title: 'Manage wallets',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton title="Done" /> : undefined,
        }}
      />
      <Stack.Screen
        name="seed"
        options={{
          ...modalOptions,

          presentation: Platform.select({
            ios: 'modal',
            default: 'transparentModal',
          }),
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Wallet seed',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton title="Done" /> : undefined,
        }}
      />
      <Stack.Screen
        name="delete"
        options={{
          ...modalOptions,
          presentation: Platform.select({
            ios: 'modal',
            default: 'transparentModal',
          }),
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Delete wallet',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton /> : undefined,
        }}
      />
      <Stack.Screen
        name="send"
        options={{
          ...modalOptions,
          presentation: Platform.select({
            ios: 'modal',
            default: 'transparentModal',
          }),
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Send Bitcoin',
          headerRight:
            Platform.OS === 'ios' ? () => <CloseModalButton title="Cancel" /> : undefined,
        }}
      />
      <Stack.Screen
        name="receive"
        options={{
          ...modalOptions,
          presentation: Platform.select({
            ios: 'modal',
            default: 'transparentModal',
          }),
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Receive Bitcoin',
          headerRight:
            Platform.OS === 'ios' ? () => <CloseModalButton title="Cancel" /> : undefined,
        }}
      />
    </Stack>
  )
}
