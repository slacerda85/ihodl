import { Stack } from 'expo-router'
import colors from '@/ui/colors'
import { useActiveColorMode } from '@/ui/features/app-provider'

export default function LightningLayout() {
  const colorMode = useActiveColorMode()

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: {
          backgroundColor: colors.background[colorMode],
        },
        contentStyle: {
          backgroundColor: colors.background[colorMode],
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitleAlign: 'center',
          title: 'Lightning Dashboard',
        }}
      />
      <Stack.Screen
        name="channels"
        options={{
          headerTitleAlign: 'center',
          title: 'Canais',
        }}
      />
      <Stack.Screen
        name="channelCreate"
        options={{
          headerTitleAlign: 'center',
          title: 'Abrir Canal',
        }}
      />
      <Stack.Screen
        name="dualFunding"
        options={{
          headerTitleAlign: 'center',
          title: 'Dual Funding',
        }}
      />
      <Stack.Screen
        name="splice"
        options={{
          headerTitleAlign: 'center',
          title: 'Splice',
        }}
      />
      <Stack.Screen
        name="paymentSend"
        options={{
          headerTitleAlign: 'center',
          title: 'Enviar Pagamento',
        }}
      />
      <Stack.Screen
        name="paymentReceive"
        options={{
          headerTitleAlign: 'center',
          title: 'Receber Pagamento',
        }}
      />
      <Stack.Screen
        name="watchtower"
        options={{
          headerTitleAlign: 'center',
          title: 'Watchtower',
        }}
      />
      <Stack.Screen
        name="swap"
        options={{
          headerTitleAlign: 'center',
          title: 'Submarine Swap',
        }}
      />
    </Stack>
  )
}
