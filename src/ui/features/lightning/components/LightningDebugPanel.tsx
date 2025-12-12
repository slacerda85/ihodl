import React, { useMemo, useSyncExternalStore } from 'react'
import { View, Text, StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useActiveColorMode, useConnection } from '@/ui/features/app-provider'
import { useAppContext } from '@/ui/features/app-provider/AppProvider'
import { useLightningReadiness } from '@/ui/features/lightning/hooks/useLightningReadiness'
import type { LightningStoreState } from '../store'

/**
 * LightningDebugPanel
 *
 * Dev-only panel to visualize Lightning initialization/telemetry.
 * Shows readiness, connectivity, channel counts, and service status in flow order.
 */
export default function LightningDebugPanel() {
  const isDev = __DEV__

  const colorMode = useActiveColorMode()
  const connection = useConnection()
  const { readinessState, readinessLevel } = useLightningReadiness()
  const { lightning } = useAppContext()

  const lightningState = useSyncExternalStore(
    lightning.subscribe,
    lightning.getSnapshot,
  ) as LightningStoreState

  const channelStats = useMemo(() => {
    const total = lightningState.channels.length
    const active = lightningState.channels.filter(ch => ch.isActive).length
    return { total, active }
  }, [lightningState.channels])

  const readinessBlocks = useMemo(() => {
    return [
      { label: 'Wallet loaded', value: readinessState.isWalletLoaded },
      { label: 'Transport connected', value: readinessState.isTransportConnected },
      { label: 'Peer connected', value: readinessState.isPeerConnected },
      { label: 'Channels reestablished', value: readinessState.isChannelReestablished },
      { label: 'Gossip synced / trampoline ready', value: readinessState.isGossipSynced },
      { label: 'Watcher running', value: readinessState.isWatcherRunning },
    ]
  }, [readinessState])

  const initFlow = [
    { step: 'Electrum connect', ok: connection.electrum.connected },
    { step: 'Peer connectivity', ok: readinessState.isPeerConnected },
    { step: 'Channel reestablish', ok: readinessState.isChannelReestablished },
    { step: 'Gossip / trampoline', ok: readinessState.isGossipSynced },
    { step: 'Watcher', ok: readinessState.isWatcherRunning },
  ]

  const palette = styles[colorMode]

  if (!isDev) return null

  return (
    <View style={palette.card}>
      <Text style={palette.title}>Lightning Debug (dev)</Text>

      <View style={palette.row}>
        <View style={palette.badge}>
          <Text style={palette.badgeText}>Init</Text>
        </View>
        <Text style={palette.value}>{lightningState.initStatus}</Text>
      </View>

      <View style={palette.rowBetween}>
        <Text style={palette.label}>Readiness</Text>
        <Text style={palette.value}>{ReadinessLevelLabel[readinessLevel] || readinessLevel}</Text>
      </View>

      <View style={palette.section}>
        <Text style={palette.sectionTitle}>Connectivity</Text>
        <Text style={palette.line}>
          Electrum: {connection.electrum.connected ? 'connected' : 'offline'}
        </Text>
        <Text style={palette.line}>
          Peer:{' '}
          {connection.lightning.connected || readinessState.isPeerConnected
            ? 'connected'
            : 'offline'}
        </Text>
        <Text style={palette.line}>PeerId: {connection.lightning.peerId ?? '-'}</Text>
      </View>

      <View style={palette.section}>
        <Text style={palette.sectionTitle}>Channels & Graph</Text>
        <Text style={palette.line}>
          Channels: {channelStats.active}/{channelStats.total} active
        </Text>
        <Text style={palette.line}>Invoices: {lightningState.invoices.length}</Text>
        <Text style={palette.line}>Payments: {lightningState.payments.length}</Text>
      </View>

      <View style={palette.section}>
        <Text style={palette.sectionTitle}>Readiness Flags</Text>
        {readinessBlocks.map(item => (
          <View key={item.label} style={palette.rowBetween}>
            <Text style={palette.label}>{item.label}</Text>
            <Text style={[palette.value, item.value ? palette.ok : palette.warn]}>
              {item.value ? 'ok' : 'pending'}
            </Text>
          </View>
        ))}
      </View>

      <View style={palette.section}>
        <Text style={palette.sectionTitle}>Init Flow</Text>
        {initFlow.map(step => (
          <View key={step.step} style={palette.rowBetween}>
            <Text style={palette.label}>{step.step}</Text>
            <Text style={[palette.value, step.ok ? palette.ok : palette.warn]}>
              {step.ok ? 'done' : 'waiting'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const ReadinessLevelLabel: Record<string, string> = {
  NOT_READY: 'Not ready',
  CAN_RECEIVE: 'Can receive',
  CAN_SEND: 'Can send',
  FULLY_READY: 'Fully ready',
  '0': 'Not ready',
  '1': 'Can receive',
  '2': 'Can send',
  '3': 'Fully ready',
}

type Palette = {
  card: ViewStyle
  title: TextStyle
  section: ViewStyle
  sectionTitle: TextStyle
  row: ViewStyle
  rowBetween: ViewStyle
  label: TextStyle
  value: TextStyle
  line: TextStyle
  badge: ViewStyle
  badgeText: TextStyle
  ok: TextStyle
  warn: TextStyle
}

const base: Palette = {
  card: {
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700' as TextStyle['fontWeight'],
    marginBottom: 8,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700' as TextStyle['fontWeight'],
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  value: {
    fontSize: 14,
    color: colors.text.light,
  },
  line: {
    fontSize: 14,
    color: colors.text.light,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700' as TextStyle['fontWeight'],
  },
  ok: {
    color: colors.success,
  },
  warn: {
    color: colors.warning,
  },
}

const light = StyleSheet.create<Palette>({
  ...base,
  card: {
    ...base.card,
    backgroundColor: colors.white,
    borderColor: alpha(colors.textSecondary.light, 0.1),
  },
  title: {
    ...base.title,
    color: colors.text.light,
  },
  sectionTitle: {
    ...base.sectionTitle,
    color: colors.textSecondary.light,
  },
  label: {
    ...base.label,
    color: colors.textSecondary.light,
  },
  value: {
    ...base.value,
    color: colors.text.light,
  },
  line: {
    ...base.line,
    color: colors.text.light,
  },
  badge: {
    ...base.badge,
    backgroundColor: alpha(colors.primary, 0.1),
  },
  badgeText: {
    ...base.badgeText,
    color: colors.primary,
  },
  ok: {
    ...base.ok,
    color: colors.success,
  },
  warn: {
    ...base.warn,
    color: colors.warning,
  },
})

const dark = StyleSheet.create<Palette>({
  ...base,
  card: {
    ...base.card,
    backgroundColor: alpha(colors.background.dark, 0.4),
    borderColor: alpha(colors.textSecondary.dark, 0.2),
  },
  title: {
    ...base.title,
    color: colors.text.dark,
  },
  sectionTitle: {
    ...base.sectionTitle,
    color: colors.textSecondary.dark,
  },
  label: {
    ...base.label,
    color: colors.textSecondary.dark,
  },
  value: {
    ...base.value,
    color: colors.text.dark,
  },
  line: {
    ...base.line,
    color: colors.text.dark,
  },
  badge: {
    ...base.badge,
    backgroundColor: alpha(colors.primary, 0.15),
  },
  badgeText: {
    ...base.badgeText,
    color: colors.primary,
  },
  ok: {
    ...base.ok,
    color: colors.success,
  },
  warn: {
    ...base.warn,
    color: colors.warning,
  },
})

const styles: Record<'light' | 'dark', Palette> = { light, dark }
