import React, { useMemo, useSyncExternalStore } from 'react'
import { View, Text, StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useActiveColorMode, useConnection } from '@/ui/features/app-provider'
import { useAppContext } from '@/ui/features/app-provider/AppProvider'
import { useLightningReadiness } from '@/ui/features/lightning/hooks/useLightningReadiness'
import { useLightningDebugSnapshot } from '@/ui/features/lightning/hooks/useLightningDebugSnapshot'
import { useBackgroundGossipSync } from '@/ui/features/lightning/hooks/useBackgroundGossipSync'
import GossipSyncProgress from './GossipSyncProgress'
import type { LightningStoreState } from '../store'

type InitPhase = {
  id: string
  label: string
  status: 'pending' | 'running' | 'ok' | 'error'
  detail?: string
}

/**
 * LightningDebugPanel
 *
 * Dev-only panel to visualize Lightning initialization/telemetry.
 * Shows initialization flow based on the correct boot graph:
 *
 * 1. Load State → 2. Electrum → 3. Peers → 4. Channels → 5. Gossip → 6. Watcher → 7. READY
 */
export default function LightningDebugPanel() {
  const isDev = __DEV__

  const colorMode = useActiveColorMode()
  const connection = useConnection()
  const { readinessState, readinessLevel } = useLightningReadiness()
  const debug = useLightningDebugSnapshot()
  const { lightning } = useAppContext()
  const { progress: gossipProgress, state: gossipState } = useBackgroundGossipSync()

  const lightningState = useSyncExternalStore(
    lightning.subscribe,
    lightning.getSnapshot,
  ) as LightningStoreState

  const workerMetrics = useMemo(() => debug.workerMetrics ?? {}, [debug.workerMetrics])

  const channelStats = useMemo(() => {
    const total = lightningState.channels.length
    const active = lightningState.channels.filter(ch => ch.isActive).length
    return { total, active }
  }, [lightningState.channels])

  const graphStats = useMemo(() => {
    const overall = gossipProgress?.overall ?? 0
    const percent = Math.round(overall * 100)
    return {
      percent,
      nodes: gossipProgress?.nodesDiscovered ?? 0,
      channels: gossipProgress?.channelsDiscovered ?? 0,
    }
  }, [gossipProgress])

  // Determine current phase based on worker status
  const currentPhase = debug.workerStatus?.phase ?? 'idle'

  // Build initialization flow phases following the correct boot graph
  const initPhases: InitPhase[] = useMemo(() => {
    const isElectrumOk = readinessState.isTransportConnected || connection.electrum.connected
    const isPeerOk = readinessState.isPeerConnected ?? false
    const isChannelsOk = readinessState.isChannelReestablished ?? false
    const isGossipOk =
      (readinessState.isGossipSynced ?? false) || (workerMetrics.gossipCompleted ?? false)
    const isWatcherOk = readinessState.isWatcherRunning ?? false

    // Helper to determine status based on sequence
    const getStatus = (
      isOk: boolean,
      prevOk: boolean,
      phaseKeywords: string[],
    ): 'pending' | 'running' | 'ok' | 'error' => {
      if (isOk) return 'ok'
      if (!prevOk) return 'pending'
      // Check if current phase matches any keyword
      const phaseStr = currentPhase.toLowerCase()
      if (phaseKeywords.some(kw => phaseStr.includes(kw))) return 'running'
      return 'pending'
    }

    return [
      {
        id: 'load',
        label: '1. Load State',
        status: readinessState.isWalletLoaded ? 'ok' : 'running',
        detail: readinessState.isWalletLoaded ? 'Wallet carregada' : 'Carregando...',
      },
      {
        id: 'electrum',
        label: '2. Electrum Connect',
        status: getStatus(isElectrumOk, readinessState.isWalletLoaded ?? false, [
          'electrum',
          'connect',
        ]),
        detail: isElectrumOk ? `height ${workerMetrics.electrumHeight ?? '-'}` : 'Conectando...',
      },
      {
        id: 'peers',
        label: '3. Peer Connect (BOLT #8)',
        status: getStatus(isPeerOk, isElectrumOk, ['peer', 'noise', 'handshake']),
        detail: isPeerOk
          ? `${workerMetrics.connectedPeers ?? 0} peer(s) conectado(s)`
          : 'Handshake Noise XK...',
      },
      {
        id: 'channels',
        label: '4. Channel Reestablish',
        status: getStatus(isChannelsOk, isPeerOk, ['channel', 'reestablish']),
        detail: isChannelsOk
          ? `${channelStats.active}/${channelStats.total} ativos`
          : channelStats.total > 0
            ? 'Reestabelecendo...'
            : 'Sem canais',
      },
      {
        id: 'gossip',
        label: '5. Gossip Sync',
        status: getStatus(isGossipOk, isChannelsOk || channelStats.total === 0, [
          'gossip',
          'routing',
          'graph',
        ]),
        detail: isGossipOk
          ? `${graphStats.nodes} nós · ${graphStats.channels} canais`
          : `${graphStats.percent}% sincronizado`,
      },
      {
        id: 'watcher',
        label: '6. Watchtower Start',
        status: getStatus(isWatcherOk, isGossipOk, ['watcher', 'monitor', 'watchtower']),
        detail: isWatcherOk ? 'Rodando' : 'Iniciando...',
      },
      {
        id: 'ready',
        label: '7. READY',
        status:
          isWatcherOk && isGossipOk && (isChannelsOk || channelStats.total === 0)
            ? 'ok'
            : 'pending',
        detail:
          isWatcherOk && isGossipOk && (isChannelsOk || channelStats.total === 0)
            ? ReadinessLevelLabel[readinessLevel] || 'Pronto'
            : 'Aguardando etapas anteriores',
      },
    ]
  }, [
    readinessState,
    connection.electrum.connected,
    workerMetrics,
    channelStats,
    graphStats,
    currentPhase,
    readinessLevel,
  ])

  // Live logger message
  const liveLogger = () => {
    if (debug.workerStatus?.message) return debug.workerStatus.message
    const runningPhase = initPhases.find(p => p.status === 'running')
    if (runningPhase) return runningPhase.detail ?? runningPhase.label
    const allOk = initPhases.every(p => p.status === 'ok')
    if (allOk) return 'Worker ocioso - pronto para operações'
    return 'Inicializando Lightning...'
  }

  const palette = styles[colorMode]

  if (!isDev) return null

  return (
    <View style={palette.card}>
      <Text style={palette.title}>⚡ Lightning Debug</Text>

      {/* Live Logger */}
      <View style={palette.logger}>
        <Text style={palette.loggerLabel}>Live Logger</Text>
        <Text style={palette.loggerText}>{liveLogger()}</Text>
      </View>

      {/* Initialization Flow */}
      <View style={palette.section}>
        <Text style={palette.sectionTitle}>Fluxo de Inicialização</Text>
        {initPhases.map(phase => (
          <View key={phase.id} style={palette.phaseRow}>
            <View style={palette.phaseLeft}>
              <Text style={[palette.phaseIcon, palette[phase.status]]}>
                {phase.status === 'ok' ? '✓' : phase.status === 'running' ? '◌' : '○'}
              </Text>
              <Text style={[palette.phaseLabel, phase.status === 'ok' && palette.phaseLabelDone]}>
                {phase.label}
              </Text>
            </View>
            <Text style={[palette.phaseDetail, palette[phase.status]]}>{phase.detail}</Text>
          </View>
        ))}
      </View>

      {/* Gossip Sync Progress */}
      <View style={palette.section}>
        <Text style={palette.sectionTitle}>Sync do Grafo (Gossip)</Text>
        <GossipSyncProgress compact />
      </View>

      {/* Quick Stats */}
      <View style={palette.section}>
        <Text style={palette.sectionTitle}>Status Rápido</Text>
        <View style={palette.statsGrid}>
          <View style={palette.statBox}>
            <Text style={palette.statValue}>{workerMetrics.electrumHeight ?? '-'}</Text>
            <Text style={palette.statLabel}>Block Height</Text>
          </View>
          <View style={palette.statBox}>
            <Text style={palette.statValue}>{workerMetrics.connectedPeers ?? 0}</Text>
            <Text style={palette.statLabel}>Peers</Text>
          </View>
          <View style={palette.statBox}>
            <Text style={palette.statValue}>
              {channelStats.active}/{channelStats.total}
            </Text>
            <Text style={palette.statLabel}>Canais</Text>
          </View>
          <View style={palette.statBox}>
            <Text style={palette.statValue}>{lightningState.payments.length}</Text>
            <Text style={palette.statLabel}>Pagamentos</Text>
          </View>
        </View>
      </View>

      {/* Readiness Level */}
      <View style={palette.section}>
        <View style={palette.rowBetween}>
          <Text style={palette.label}>Readiness Level</Text>
          <Text style={[palette.value, palette[readinessLevel >= 3 ? 'ok' : 'pending']]}>
            {ReadinessLevelLabel[readinessLevel] || readinessLevel}
          </Text>
        </View>
        <View style={palette.rowBetween}>
          <Text style={palette.label}>Worker Phase</Text>
          <Text style={palette.value}>{currentPhase}</Text>
        </View>
        <View style={palette.rowBetween}>
          <Text style={palette.label}>Gossip State</Text>
          <Text style={palette.value}>{gossipState?.toLowerCase?.() ?? '-'}</Text>
        </View>
      </View>
    </View>
  )
}

const ReadinessLevelLabel: Record<string | number, string> = {
  NOT_READY: 'Not ready',
  CAN_RECEIVE: 'Can receive',
  CAN_SEND: 'Can send',
  FULLY_READY: 'Fully ready',
  0: 'Not ready',
  1: 'Can receive',
  2: 'Can send',
  3: 'Fully ready',
}

type Palette = {
  card: ViewStyle
  title: TextStyle
  logger: ViewStyle
  loggerLabel: TextStyle
  loggerText: TextStyle
  section: ViewStyle
  sectionTitle: TextStyle
  row: ViewStyle
  rowBetween: ViewStyle
  phaseRow: ViewStyle
  phaseLeft: ViewStyle
  phaseIcon: TextStyle
  phaseLabel: TextStyle
  phaseLabelDone: TextStyle
  phaseDetail: TextStyle
  statsGrid: ViewStyle
  statBox: ViewStyle
  statValue: TextStyle
  statLabel: TextStyle
  label: TextStyle
  value: TextStyle
  ok: TextStyle
  running: TextStyle
  pending: TextStyle
  error: TextStyle
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
    marginBottom: 12,
  },
  logger: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  loggerLabel: {
    fontSize: 11,
    fontWeight: '600' as TextStyle['fontWeight'],
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loggerText: {
    fontSize: 14,
    fontWeight: '500' as TextStyle['fontWeight'],
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700' as TextStyle['fontWeight'],
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  phaseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  phaseIcon: {
    fontSize: 16,
    fontWeight: '700' as TextStyle['fontWeight'],
    width: 20,
    textAlign: 'center',
  },
  phaseLabel: {
    fontSize: 13,
    fontWeight: '500' as TextStyle['fontWeight'],
  },
  phaseLabelDone: {
    opacity: 0.7,
  },
  phaseDetail: {
    fontSize: 12,
    fontWeight: '400' as TextStyle['fontWeight'],
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  statBox: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700' as TextStyle['fontWeight'],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500' as TextStyle['fontWeight'],
    marginTop: 2,
  },
  label: {
    fontSize: 13,
  },
  value: {
    fontSize: 13,
    fontWeight: '500' as TextStyle['fontWeight'],
  },
  ok: {
    color: colors.success,
  },
  running: {
    color: colors.primary,
  },
  pending: {
    color: colors.textSecondary.light,
  },
  error: {
    color: colors.error,
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
  logger: {
    ...base.logger,
    backgroundColor: alpha(colors.primary, 0.08),
    borderColor: alpha(colors.primary, 0.15),
    borderWidth: 1,
  },
  loggerLabel: {
    ...base.loggerLabel,
    color: colors.textSecondary.light,
  },
  loggerText: {
    ...base.loggerText,
    color: colors.text.light,
  },
  sectionTitle: {
    ...base.sectionTitle,
    color: colors.textSecondary.light,
  },
  phaseRow: {
    ...base.phaseRow,
    backgroundColor: alpha(colors.textSecondary.light, 0.05),
  },
  phaseLabel: {
    ...base.phaseLabel,
    color: colors.text.light,
  },
  phaseDetail: {
    ...base.phaseDetail,
    color: colors.textSecondary.light,
  },
  statBox: {
    ...base.statBox,
    backgroundColor: alpha(colors.textSecondary.light, 0.08),
  },
  statValue: {
    ...base.statValue,
    color: colors.text.light,
  },
  statLabel: {
    ...base.statLabel,
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
  pending: {
    ...base.pending,
    color: colors.textSecondary.light,
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
  logger: {
    ...base.logger,
    backgroundColor: alpha(colors.primary, 0.12),
    borderColor: alpha(colors.textSecondary.dark, 0.25),
    borderWidth: 1,
  },
  loggerLabel: {
    ...base.loggerLabel,
    color: colors.textSecondary.dark,
  },
  loggerText: {
    ...base.loggerText,
    color: colors.text.dark,
  },
  sectionTitle: {
    ...base.sectionTitle,
    color: colors.textSecondary.dark,
  },
  phaseRow: {
    ...base.phaseRow,
    backgroundColor: alpha(colors.textSecondary.dark, 0.1),
  },
  phaseLabel: {
    ...base.phaseLabel,
    color: colors.text.dark,
  },
  phaseDetail: {
    ...base.phaseDetail,
    color: colors.textSecondary.dark,
  },
  statBox: {
    ...base.statBox,
    backgroundColor: alpha(colors.textSecondary.dark, 0.15),
  },
  statValue: {
    ...base.statValue,
    color: colors.text.dark,
  },
  statLabel: {
    ...base.statLabel,
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
  pending: {
    ...base.pending,
    color: colors.textSecondary.dark,
  },
})

const styles: Record<'light' | 'dark', Palette> = { light, dark }
