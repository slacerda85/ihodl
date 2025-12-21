import React, { useMemo } from 'react'
import { View, Text, StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useActiveColorMode } from '@/ui/features/app-provider'
import { useBackgroundGossipSync } from '@/ui/features/lightning/hooks/useBackgroundGossipSync'
import { BackgroundSyncState } from '@/core/services/ln-worker-service'

/**
 * State labels for gossip sync
 */
const stateLabels: Record<BackgroundSyncState, string> = {
  [BackgroundSyncState.IDLE]: 'Aguardando',
  [BackgroundSyncState.INITIALIZING]: 'Inicializando...',
  [BackgroundSyncState.SYNCING]: 'Sincronizando...',
  [BackgroundSyncState.COMPLETED]: 'Concluído',
  [BackgroundSyncState.ERROR]: 'Erro',
  [BackgroundSyncState.PAUSED]: 'Pausado',
}

/**
 * Format large numbers with K/M suffix
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`
  }
  return num.toString()
}

interface GossipSyncProgressProps {
  /** Show compact version (single line) */
  compact?: boolean
  /** Hide when sync is completed */
  hideWhenCompleted?: boolean
}

/**
 * GossipSyncProgress
 *
 * Component to display Lightning Network gossip sync progress.
 * Similar to Electrum wallet's network sync display showing:
 * - Current sync state
 * - Progress percentage
 * - Nodes discovered
 * - Channels discovered
 * - Last block height
 */
export default function GossipSyncProgress({
  compact = false,
  hideWhenCompleted = false,
}: GossipSyncProgressProps) {
  const colorMode = useActiveColorMode()
  const { state, progress, isCompleted, isSyncing } = useBackgroundGossipSync()

  const syncData = useMemo(() => {
    const overall = progress?.overall ?? 0
    const percent = Math.round(overall * 100)
    const nodes = progress?.nodesDiscovered ?? 0
    const channels = progress?.channelsDiscovered ?? 0
    const lastBlock = progress?.lastBlockHeight ?? 0

    return {
      percent,
      nodes,
      channels,
      lastBlock,
      nodesFormatted: formatNumber(nodes),
      channelsFormatted: formatNumber(channels),
    }
  }, [progress])

  const palette = styles[colorMode]

  // Hide when completed if requested
  if (hideWhenCompleted && isCompleted) {
    return null
  }

  // Compact mode - single line
  if (compact) {
    return (
      <View style={palette.compactContainer}>
        <View style={palette.compactRow}>
          <Text style={[palette.compactIcon, getStateColor(state, palette)]}>
            {getStateIcon(state)}
          </Text>
          <Text style={palette.compactLabel}>Gossip</Text>
          <Text style={[palette.compactValue, getStateColor(state, palette)]}>
            {isCompleted
              ? `${syncData.nodesFormatted} nós · ${syncData.channelsFormatted} canais`
              : isSyncing
                ? `${syncData.percent}%`
                : stateLabels[state]}
          </Text>
        </View>
        {isSyncing && (
          <View style={palette.progressBarContainer}>
            <View style={[palette.progressBar, { width: `${syncData.percent}%` }]} />
          </View>
        )}
      </View>
    )
  }

  // Full mode - detailed card
  return (
    <View style={palette.card}>
      <View style={palette.header}>
        <Text style={palette.title}>⚡ Sync do Grafo Lightning</Text>
        <Text style={[palette.stateLabel, getStateColor(state, palette)]}>
          {getStateIcon(state)} {stateLabels[state]}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={palette.progressSection}>
        <View style={palette.progressBarContainerFull}>
          <View
            style={[
              palette.progressBarFull,
              { width: `${syncData.percent}%` },
              isCompleted && palette.progressBarCompleted,
            ]}
          />
        </View>
        <Text style={palette.percentText}>{syncData.percent}%</Text>
      </View>

      {/* Stats grid */}
      <View style={palette.statsGrid}>
        <View style={palette.statItem}>
          <Text style={palette.statValue}>{syncData.nodesFormatted}</Text>
          <Text style={palette.statLabel}>Nós</Text>
        </View>
        <View style={palette.statItem}>
          <Text style={palette.statValue}>{syncData.channelsFormatted}</Text>
          <Text style={palette.statLabel}>Canais</Text>
        </View>
        <View style={palette.statItem}>
          <Text style={palette.statValue}>{syncData.lastBlock || '-'}</Text>
          <Text style={palette.statLabel}>Bloco</Text>
        </View>
      </View>

      {/* Status message */}
      {isSyncing && (
        <Text style={palette.statusMessage}>Baixando dados do grafo da rede Lightning...</Text>
      )}
      {isCompleted && (
        <Text style={[palette.statusMessage, palette.completedMessage]}>
          Grafo sincronizado. Roteamento local disponível.
        </Text>
      )}
      {state === BackgroundSyncState.ERROR && (
        <Text style={[palette.statusMessage, palette.errorMessage]}>
          Erro na sincronização. Usando modo trampoline.
        </Text>
      )}
    </View>
  )
}

/**
 * Get icon for sync state
 */
function getStateIcon(state: BackgroundSyncState): string {
  switch (state) {
    case BackgroundSyncState.COMPLETED:
      return '✓'
    case BackgroundSyncState.SYNCING:
    case BackgroundSyncState.INITIALIZING:
      return '◌'
    case BackgroundSyncState.ERROR:
      return '✗'
    case BackgroundSyncState.PAUSED:
      return '⏸'
    default:
      return '○'
  }
}

/**
 * Get color style for state
 */
function getStateColor(state: BackgroundSyncState, palette: Palette): TextStyle {
  switch (state) {
    case BackgroundSyncState.COMPLETED:
      return palette.colorOk
    case BackgroundSyncState.SYNCING:
    case BackgroundSyncState.INITIALIZING:
      return palette.colorSyncing
    case BackgroundSyncState.ERROR:
      return palette.colorError
    default:
      return palette.colorPending
  }
}

type Palette = {
  // Compact mode
  compactContainer: ViewStyle
  compactRow: ViewStyle
  compactIcon: TextStyle
  compactLabel: TextStyle
  compactValue: TextStyle
  progressBarContainer: ViewStyle
  progressBar: ViewStyle
  // Full mode
  card: ViewStyle
  header: ViewStyle
  title: TextStyle
  stateLabel: TextStyle
  progressSection: ViewStyle
  progressBarContainerFull: ViewStyle
  progressBarFull: ViewStyle
  progressBarCompleted: ViewStyle
  percentText: TextStyle
  statsGrid: ViewStyle
  statItem: ViewStyle
  statValue: TextStyle
  statLabel: TextStyle
  statusMessage: TextStyle
  completedMessage: TextStyle
  errorMessage: TextStyle
  // Colors
  colorOk: TextStyle
  colorSyncing: TextStyle
  colorError: TextStyle
  colorPending: TextStyle
}

const base: Palette = {
  // Compact
  compactContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactIcon: {
    fontSize: 14,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  compactLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  compactValue: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  progressBarContainer: {
    height: 3,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  // Full
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  stateLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  progressBarContainerFull: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFull: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  progressBarCompleted: {
    backgroundColor: colors.success,
  },
  percentText: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 80,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  statusMessage: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  completedMessage: {
    color: colors.success,
  },
  errorMessage: {
    color: colors.error,
  },
  // Colors
  colorOk: {
    color: colors.success,
  },
  colorSyncing: {
    color: colors.primary,
  },
  colorError: {
    color: colors.error,
  },
  colorPending: {
    color: colors.textSecondary.light,
  },
}

const light = StyleSheet.create<Palette>({
  ...base,
  compactContainer: {
    ...base.compactContainer,
    backgroundColor: alpha(colors.primary, 0.06),
  },
  compactLabel: {
    ...base.compactLabel,
    color: colors.textSecondary.light,
  },
  progressBarContainer: {
    ...base.progressBarContainer,
    backgroundColor: alpha(colors.textSecondary.light, 0.15),
  },
  card: {
    ...base.card,
    backgroundColor: colors.white,
    borderColor: alpha(colors.textSecondary.light, 0.1),
  },
  title: {
    ...base.title,
    color: colors.text.light,
  },
  progressBarContainerFull: {
    ...base.progressBarContainerFull,
    backgroundColor: alpha(colors.textSecondary.light, 0.15),
  },
  percentText: {
    ...base.percentText,
    color: colors.text.light,
  },
  statValue: {
    ...base.statValue,
    color: colors.text.light,
  },
  statLabel: {
    ...base.statLabel,
    color: colors.textSecondary.light,
  },
  statusMessage: {
    ...base.statusMessage,
    color: colors.textSecondary.light,
  },
  colorPending: {
    ...base.colorPending,
    color: colors.textSecondary.light,
  },
})

const dark = StyleSheet.create<Palette>({
  ...base,
  compactContainer: {
    ...base.compactContainer,
    backgroundColor: alpha(colors.primary, 0.1),
  },
  compactLabel: {
    ...base.compactLabel,
    color: colors.textSecondary.dark,
  },
  progressBarContainer: {
    ...base.progressBarContainer,
    backgroundColor: alpha(colors.textSecondary.dark, 0.2),
  },
  card: {
    ...base.card,
    backgroundColor: alpha(colors.background.dark, 0.4),
    borderColor: alpha(colors.textSecondary.dark, 0.2),
  },
  title: {
    ...base.title,
    color: colors.text.dark,
  },
  progressBarContainerFull: {
    ...base.progressBarContainerFull,
    backgroundColor: alpha(colors.textSecondary.dark, 0.2),
  },
  percentText: {
    ...base.percentText,
    color: colors.text.dark,
  },
  statValue: {
    ...base.statValue,
    color: colors.text.dark,
  },
  statLabel: {
    ...base.statLabel,
    color: colors.textSecondary.dark,
  },
  statusMessage: {
    ...base.statusMessage,
    color: colors.textSecondary.dark,
  },
  colorPending: {
    ...base.colorPending,
    color: colors.textSecondary.dark,
  },
})

const styles: Record<'light' | 'dark', Palette> = { light, dark }
