import colors from '@/ui/colors'
import { DynamicColorIOS } from 'react-native'
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs'

export default function TabsLayout() {
  return (
    <NativeTabs
      iconColor={DynamicColorIOS({
        light: colors.primary,
        dark: colors.primary,
      })}
    >
      <NativeTabs.Trigger name="wallet">
        <Icon sf="wallet.bifold.fill" />
        <Label>Wallet</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="transactions">
        <Icon sf="arrow.left.arrow.right" />
        <Label>Transactions</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="blockchain">
        <Icon sf="cube.box.fill" />
        <Label>Blockchain</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf="gearshape.fill" />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search" role="search">
        <Label>Search</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
