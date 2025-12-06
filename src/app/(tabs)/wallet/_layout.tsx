import { Link, Stack, useRouter } from 'expo-router'
import { Pressable, Platform } from 'react-native'
import colors from '@/ui/colors'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/ui/features/auth/AuthProvider'
import { ComponentProps, useCallback, useEffect } from 'react'
import { useIsDark } from '@/ui/features/settings'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import {} from 'expo-router'
import { alpha } from '@/ui/utils'
// import { useWallet } from '@/ui/state/'
import { useActiveWallet } from '@/ui/features/wallet/WalletProviderV2'

const IOS_MODAL_HEADER_HEIGHT = 74

function WalletActions({ colorMode }: { colorMode: 'light' | 'dark' }) {
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
        <Ionicons
          name="ellipsis-vertical"
          size={24}
          color={alpha(colors.textSecondary[colorMode], 0.85)}
        />
      </Pressable>
    </Link>
  )
}

// link to wallet/manage
function ManageWallets({ colorMode }: { colorMode: 'light' | 'dark' }) {
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
      <IconSymbol
        name="wallet.bifold"
        // size={28}
        color={alpha(colors.textSecondary[colorMode], 0.85)}
      />
    </Pressable>
  )
}

const CloseModalButton = ({ colorMode }: { colorMode: 'light' | 'dark' }) => {
  const router = useRouter()
  const { inactive } = useAuth()
  // const { isDark } = useSettings()

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
      onPress={handleClose}
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconSymbol name="xmark" color={alpha(colors.textSecondary[colorMode], 0.8)} />
    </Pressable>
  )
}

type StackScreenOptions = ComponentProps<typeof Stack.Screen>['options']

export default function WalletLayout() {
  // const { activeWalletId, wallets } = useWallet()

  const activeWallet = useActiveWallet()
  const empty = !activeWallet

  const isDark = useIsDark()
  const colorMode = isDark ? 'dark' : 'light'

  const modalOptions: StackScreenOptions = {
    presentation: 'modal',
    headerStyle: {
      backgroundColor: isDark
        ? alpha(colors.background.dark, 0.1)
        : alpha(colors.background.light, 0.1),
    },
    contentStyle: {
      paddingTop: Platform.OS === 'ios' ? IOS_MODAL_HEADER_HEIGHT : 0,
      backgroundColor: isDark
        ? alpha(colors.background.dark, 0.1)
        : alpha(colors.background.light, 0.1),
    },
  }

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTransparent: true,
        headerTintColor: isDark ? colors.text.dark : colors.text.light,
        contentStyle: {
          backgroundColor: isDark ? colors.background.dark : colors.background.light,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => (empty ? null : <ManageWallets colorMode={colorMode} />),
          headerRight: () => (empty ? null : <WalletActions colorMode={colorMode} />),
          headerTitleAlign: 'center',
          title: activeWallet?.name || (empty ? 'No wallets' : 'Select wallet'),
        }}
      />
      <Stack.Screen
        name="actions"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Wallet actions',
          headerRight: () => <CloseModalButton colorMode={colorMode} />,
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Create wallet',
          headerRight: () => <CloseModalButton colorMode={colorMode} />,
        }}
      />
      <Stack.Screen
        name="import"
        options={{
          ...modalOptions,
          title: 'Import wallet',
          headerRight: () => <CloseModalButton colorMode={colorMode} />,
        }}
      />
      <Stack.Screen
        name="manage"
        options={{
          ...modalOptions,

          animation: Platform.OS === 'android' ? 'slide_from_left' : undefined,
          title: 'Manage wallets',
          headerRight: () => <CloseModalButton colorMode={colorMode} />,
        }}
      />
      <Stack.Screen
        name="seed"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Wallet seed',
          headerRight: () => <CloseModalButton colorMode={colorMode} />,
        }}
      />
      <Stack.Screen
        name="delete"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Delete wallet',
          headerRight: () => <CloseModalButton colorMode={colorMode} />,
        }}
      />
      <Stack.Screen
        name="send"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Send Bitcoin',
          headerRight: () => <CloseModalButton colorMode={colorMode} />,
        }}
      />
      <Stack.Screen
        name="receive"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Receive Bitcoin',
          headerRight: () => <CloseModalButton colorMode={colorMode} />,
        }}
      />
    </Stack>
  )
}
