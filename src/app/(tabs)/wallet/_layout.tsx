import { Link, Stack, useRouter } from 'expo-router'
import { Text, Pressable, Platform, View } from 'react-native'
import colors from '@/ui/colors'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCallback, useEffect } from 'react'
import { useWallet, useSettings } from '@/features/storage'
import { IconSymbol } from '@/ui/IconSymbol/IconSymbol'
import { ExtendedStackNavigationOptions } from 'expo-router/build/layouts/StackClient'
import { alpha } from '@/ui/utils'

function HeaderRight() {
  const { isDark } = useSettings()

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
          color={
            isDark
              ? alpha(colors.textSecondary.dark, 0.85)
              : alpha(colors.textSecondary.light, 0.85)
          }
        />
      </Pressable>
    </Link>
  )
}

// link to wallet/manage
function ManageWallets() {
  const router = useRouter()
  const { isDark } = useSettings()

  function handleManageWallets() {
    router.push('/wallet/manage' as any)
  }

  return (
    <View
      style={{
        // backgroundColor: 'red',
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        paddingBottom: 3,
      }}
    >
      <Pressable
        onPress={handleManageWallets}
        style={{
          // width: '100%',
          // height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          // backgroundColor: 'green',
        }}
      >
        <IconSymbol
          name="wallet.bifold"
          size={28}
          color={
            isDark
              ? alpha(colors.textSecondary.dark, 0.85)
              : alpha(colors.textSecondary.light, 0.85)
          }
        />
      </Pressable>
    </View>
  )
}

const CloseModalButton = ({ title }: { title?: string }) => {
  const router = useRouter()
  const { inactive } = useAuth()
  const { isDark } = useSettings()

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
      style={{ paddingVertical: 8, paddingLeft: 12, paddingRight: 12 }}
      onPress={handleClose}
    >
      <Text
        style={{
          fontSize: 16,
          // fontWeight: 'bold',
          color: isDark
            ? alpha(colors.textSecondary.dark, 0.85)
            : alpha(colors.textSecondary.light, 0.85),
          // padding: 8,
        }}
      >
        {title || 'Close'}
      </Text>
    </Pressable>
  )
}

export default function WalletLayout() {
  const { activeWalletId, wallets } = useWallet()
  const selectedWallet = wallets?.find(wallet => wallet.walletId === activeWalletId)
  const empty = wallets === undefined || wallets?.length === 0

  const { isDark } = useSettings()

  const modalOptions: ExtendedStackNavigationOptions = {
    presentation: Platform.select({
      ios: 'modal',
      default: 'transparentModal',
    }),
    contentStyle: {
      paddingTop: Platform.OS === 'ios' ? 64 : 0,
      backgroundColor: 'transparent',
      /* isDark
        ? alpha(colors.background.dark, 0.1)
        : alpha(colors.background.light, 0.1), */
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
          headerLeft: empty ? undefined : () => ManageWallets(),
          headerRight: activeWalletId && !empty ? () => HeaderRight() : undefined,
          headerTitleAlign: 'center',
          title: selectedWallet?.walletName || (empty ? 'No wallets' : 'Select wallet'),
        }}
      />
      <Stack.Screen
        name="actions"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Wallet actions',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton title="Done" /> : undefined,
        }}
      />
      <Stack.Screen
        name="create"
        options={{
          ...modalOptions,
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
          title: 'Import wallet',
          headerRight: () => <CloseModalButton title="Cancel" />,
        }}
      />
      <Stack.Screen
        name="manage"
        options={{
          ...modalOptions,

          animation: Platform.OS === 'android' ? 'slide_from_left' : undefined,
          title: 'Manage wallets',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton title="Done" /> : undefined,
        }}
      />
      <Stack.Screen
        name="seed"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Wallet seed',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton title="Done" /> : undefined,
        }}
      />
      <Stack.Screen
        name="delete"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Delete wallet',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton /> : undefined,
        }}
      />
      <Stack.Screen
        name="send"
        options={{
          ...modalOptions,
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
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Receive Bitcoin',
          headerRight:
            Platform.OS === 'ios' ? () => <CloseModalButton title="Cancel" /> : undefined,
        }}
      />
      <Stack.Screen
        name="lightning-channels"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Lightning Channels',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton title="Close" /> : undefined,
        }}
      />
      <Stack.Screen
        name="channel-actions"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Channel Actions',
          headerRight: Platform.OS === 'ios' ? () => <CloseModalButton title="Close" /> : undefined,
        }}
      />
      <Stack.Screen
        name="open-channel"
        options={{
          ...modalOptions,
          animation: Platform.OS === 'android' ? 'slide_from_right' : undefined,
          title: 'Open Channel',
          headerRight:
            Platform.OS === 'ios' ? () => <CloseModalButton title="Cancel" /> : undefined,
        }}
      />
    </Stack>
  )
}
