/**
 * PendingSweeps Component
 *
 * Lista todos os sweeps pendentes de force closes e HTLCs.
 * Permite executar sweeps individualmente ou em lote.
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native'

// ============================================================================
// Tipos
// ============================================================================

/**
 * Tipo de sweep
 */
export enum SweepType {
  /** to_local output após CSV */
  TO_LOCAL = 'to_local',
  /** HTLC success (temos preimage) */
  HTLC_SUCCESS = 'htlc_success',
  /** HTLC timeout (expirou) */
  HTLC_TIMEOUT = 'htlc_timeout',
  /** Anchor output */
  ANCHOR = 'anchor',
  /** Penalty (breach) */
  PENALTY = 'penalty',
}

/**
 * Prioridade do sweep
 */
export enum SweepPriority {
  /** Baixa - pode esperar */
  LOW = 'low',
  /** Normal */
  NORMAL = 'normal',
  /** Alta - timelock expirando */
  HIGH = 'high',
  /** Crítica - risco de perda */
  CRITICAL = 'critical',
}

/**
 * Status do sweep
 */
export enum SweepStatus {
  /** Pendente - ainda não executado */
  PENDING = 'pending',
  /** TX broadcast, aguardando confirmação */
  BROADCASTING = 'broadcasting',
  /** Confirmado */
  CONFIRMED = 'confirmed',
  /** Falhou */
  FAILED = 'failed',
}

/**
 * Dados de um sweep pendente
 */
export interface PendingSweep {
  /** ID único */
  id: string
  /** Channel ID de origem */
  channelId: string
  /** Alias do peer */
  peerAlias?: string
  /** Tipo de sweep */
  type: SweepType
  /** Prioridade */
  priority: SweepPriority
  /** Status atual */
  status: SweepStatus
  /** Valor em satoshis */
  amount: bigint
  /** Outpoint (txid:vout) */
  outpoint: string
  /** Blocos restantes no timelock */
  timelockBlocks: number
  /** Tempo estimado até expiração */
  expiresAt?: number
  /** Fee estimada para sweep */
  estimatedFee: bigint
  /** Valor líquido após fee */
  netAmount: bigint
  /** Sweep txid (se broadcast) */
  sweepTxid?: string
  /** Confirmações */
  confirmations?: number
  /** Erro, se houver */
  error?: string
  /** Timestamp de criação */
  createdAt: number
}

export interface PendingSweepsProps {
  /** Lista de sweeps */
  sweeps: PendingSweep[]
  /** Se está carregando */
  loading?: boolean
  /** Callback para refresh */
  onRefresh?: () => Promise<void>
  /** Callback para executar sweep individual */
  onSweep?: (sweepId: string) => Promise<void>
  /** Callback para sweep em lote */
  onSweepAll?: (sweepIds: string[]) => Promise<void>
  /** Callback para ver detalhes */
  onDetails?: (sweep: PendingSweep) => void
  /** Callback para ajustar fee */
  onAdjustFee?: (sweepId: string) => void
}

// ============================================================================
// Helpers
// ============================================================================

function getSweepTypeLabel(type: SweepType): string {
  switch (type) {
    case SweepType.TO_LOCAL:
      return 'To Local'
    case SweepType.HTLC_SUCCESS:
      return 'HTLC Success'
    case SweepType.HTLC_TIMEOUT:
      return 'HTLC Timeout'
    case SweepType.ANCHOR:
      return 'Anchor'
    case SweepType.PENALTY:
      return 'Penalty'
    default:
      return 'Desconhecido'
  }
}

function getSweepTypeIcon(type: SweepType): string {
  switch (type) {
    case SweepType.TO_LOCAL:
      return '🏠'
    case SweepType.HTLC_SUCCESS:
      return '✅'
    case SweepType.HTLC_TIMEOUT:
      return '⏰'
    case SweepType.ANCHOR:
      return '⚓'
    case SweepType.PENALTY:
      return '⚖️'
    default:
      return '❓'
  }
}

function getPriorityLabel(priority: SweepPriority): string {
  switch (priority) {
    case SweepPriority.LOW:
      return 'Baixa'
    case SweepPriority.NORMAL:
      return 'Normal'
    case SweepPriority.HIGH:
      return 'Alta'
    case SweepPriority.CRITICAL:
      return 'Crítica'
    default:
      return 'Desconhecida'
  }
}

function getPriorityColor(priority: SweepPriority): string {
  switch (priority) {
    case SweepPriority.LOW:
      return '#888888'
    case SweepPriority.NORMAL:
      return '#2196F3'
    case SweepPriority.HIGH:
      return '#FFC107'
    case SweepPriority.CRITICAL:
      return '#F44336'
    default:
      return '#888888'
  }
}

function getStatusLabel(status: SweepStatus): string {
  switch (status) {
    case SweepStatus.PENDING:
      return 'Pendente'
    case SweepStatus.BROADCASTING:
      return 'Broadcasting...'
    case SweepStatus.CONFIRMED:
      return 'Confirmado'
    case SweepStatus.FAILED:
      return 'Falhou'
    default:
      return 'Desconhecido'
  }
}

function getStatusColor(status: SweepStatus): string {
  switch (status) {
    case SweepStatus.PENDING:
      return '#FFC107'
    case SweepStatus.BROADCASTING:
      return '#F7931A'
    case SweepStatus.CONFIRMED:
      return '#4CAF50'
    case SweepStatus.FAILED:
      return '#F44336'
    default:
      return '#888888'
  }
}

function formatSats(sats: bigint): string {
  const num = Number(sats)
  if (num >= 100000000) {
    return `${(num / 100000000).toFixed(8)} BTC`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(3)}k sats`
  }
  return `${num} sats`
}

function formatTimeRemaining(blocks: number): string {
  const minutes = blocks * 10
  if (minutes < 60) return `~${minutes} min`
  if (minutes < 1440) return `~${Math.round(minutes / 60)}h`
  return `~${Math.round(minutes / 1440)}d`
}

function truncateOutpoint(outpoint: string): string {
  const [txid, vout] = outpoint.split(':')
  if (!txid || txid.length <= 16) return outpoint
  return `${txid.slice(0, 8)}...${txid.slice(-4)}:${vout}`
}

// ============================================================================
// Sub-componentes
// ============================================================================

interface SweepCardProps {
  sweep: PendingSweep
  selected: boolean
  onSelect: () => void
  onSweep: () => void
  onDetails: () => void
  onAdjustFee: () => void
}

function SweepCard({
  sweep,
  selected,
  onSelect,
  onSweep,
  onDetails,
  onAdjustFee,
}: SweepCardProps): React.JSX.Element {
  const canSweep = sweep.status === SweepStatus.PENDING && sweep.timelockBlocks === 0
  const isUrgent =
    sweep.priority === SweepPriority.HIGH || sweep.priority === SweepPriority.CRITICAL

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onDetails}
      onLongPress={onSelect}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          {/* Selection Checkbox */}
          {canSweep && (
            <TouchableOpacity style={styles.checkbox} onPress={onSelect}>
              <View style={[styles.checkboxInner, selected && styles.checkboxSelected]}>
                {selected && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          )}

          {/* Type Icon */}
          <Text style={styles.typeIcon}>{getSweepTypeIcon(sweep.type)}</Text>

          {/* Info */}
          <View>
            <Text style={styles.typeLabel}>{getSweepTypeLabel(sweep.type)}</Text>
            <Text style={styles.peerAlias}>{sweep.peerAlias || 'Canal'}</Text>
          </View>
        </View>

        {/* Amount */}
        <View style={styles.cardHeaderRight}>
          <Text style={styles.amount}>{formatSats(sweep.amount)}</Text>
          <Text style={styles.netAmount}>(líq: {formatSats(sweep.netAmount)})</Text>
        </View>
      </View>

      {/* Priority & Status */}
      <View style={styles.badges}>
        <View style={[styles.badge, { backgroundColor: getPriorityColor(sweep.priority) + '20' }]}>
          <Text style={[styles.badgeText, { color: getPriorityColor(sweep.priority) }]}>
            {getPriorityLabel(sweep.priority)}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: getStatusColor(sweep.status) + '20' }]}>
          <Text style={[styles.badgeText, { color: getStatusColor(sweep.status) }]}>
            {getStatusLabel(sweep.status)}
          </Text>
        </View>
      </View>

      {/* Timelock Info */}
      {sweep.timelockBlocks > 0 && (
        <View style={[styles.timelockBar, isUrgent && styles.timelockBarUrgent]}>
          <Text style={styles.timelockIcon}>⏳</Text>
          <Text style={[styles.timelockText, isUrgent && styles.timelockTextUrgent]}>
            Timelock: {sweep.timelockBlocks} blocos ({formatTimeRemaining(sweep.timelockBlocks)})
          </Text>
        </View>
      )}

      {/* Outpoint */}
      <View style={styles.outpointRow}>
        <Text style={styles.outpointLabel}>Outpoint:</Text>
        <Text style={styles.outpointValue}>{truncateOutpoint(sweep.outpoint)}</Text>
      </View>

      {/* Fee Info */}
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>Fee estimada:</Text>
        <Text style={styles.feeValue}>{formatSats(sweep.estimatedFee)}</Text>
        <TouchableOpacity onPress={onAdjustFee}>
          <Text style={styles.adjustFeeLink}>Ajustar</Text>
        </TouchableOpacity>
      </View>

      {/* Sweep TX (if broadcast) */}
      {sweep.sweepTxid && (
        <View style={styles.sweepTxRow}>
          <Text style={styles.sweepTxLabel}>Sweep TX:</Text>
          <Text style={styles.sweepTxValue}>
            {sweep.sweepTxid.slice(0, 8)}...{sweep.sweepTxid.slice(-8)}
          </Text>
          {sweep.confirmations !== undefined && (
            <Text style={styles.confirmations}>({sweep.confirmations} confs)</Text>
          )}
        </View>
      )}

      {/* Error */}
      {sweep.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>❌ {sweep.error}</Text>
        </View>
      )}

      {/* Action Button */}
      {canSweep && (
        <TouchableOpacity style={styles.sweepButton} onPress={onSweep}>
          <Text style={styles.sweepButtonText}>Executar Sweep</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

// ============================================================================
// Componente Principal
// ============================================================================

export function PendingSweeps({
  sweeps,
  loading = false,
  onRefresh,
  onSweep,
  onSweepAll,
  onDetails,
  onAdjustFee,
}: PendingSweepsProps): React.JSX.Element {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Sweeps que podem ser executados
  const actionableSweeps = useMemo(
    () => sweeps.filter(s => s.status === SweepStatus.PENDING && s.timelockBlocks === 0),
    [sweeps],
  )

  // Estatísticas
  const stats = useMemo(() => {
    const pending = sweeps.filter(s => s.status === SweepStatus.PENDING).length
    const ready = actionableSweeps.length
    const totalValue = sweeps.reduce((acc, s) => acc + s.amount, 0n)
    const totalFee = sweeps.reduce((acc, s) => acc + s.estimatedFee, 0n)
    const urgent = sweeps.filter(
      s => s.priority === SweepPriority.HIGH || s.priority === SweepPriority.CRITICAL,
    ).length

    return { pending, ready, totalValue, totalFee, urgent }
  }, [sweeps, actionableSweeps])

  // Handlers
  const handleRefresh = useCallback(async () => {
    await onRefresh?.()
  }, [onRefresh])

  const handleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === actionableSweeps.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(actionableSweeps.map(s => s.id)))
    }
  }, [actionableSweeps, selectedIds])

  const handleSweepSelected = useCallback(async () => {
    if (selectedIds.size === 0) return

    Alert.alert(
      'Confirmar Sweep',
      `Executar sweep de ${selectedIds.size} output${selectedIds.size > 1 ? 's' : ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sweep',
          onPress: async () => {
            try {
              await onSweepAll?.(Array.from(selectedIds))
              setSelectedIds(new Set())
            } catch (error) {
              Alert.alert('Erro', `Falha no sweep: ${error}`)
            }
          },
        },
      ],
    )
  }, [selectedIds, onSweepAll])

  const handleSweepSingle = useCallback(
    async (id: string) => {
      Alert.alert('Confirmar Sweep', 'Executar sweep deste output?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sweep',
          onPress: async () => {
            try {
              await onSweep?.(id)
            } catch (error) {
              Alert.alert('Erro', `Falha no sweep: ${error}`)
            }
          },
        },
      ])
    },
    [onSweep],
  )

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: PendingSweep }) => (
      <SweepCard
        sweep={item}
        selected={selectedIds.has(item.id)}
        onSelect={() => handleSelect(item.id)}
        onSweep={() => handleSweepSingle(item.id)}
        onDetails={() => onDetails?.(item)}
        onAdjustFee={() => onAdjustFee?.(item.id)}
      />
    ),
    [selectedIds, handleSelect, handleSweepSingle, onDetails, onAdjustFee],
  )

  const keyExtractor = useCallback((item: PendingSweep) => item.id, [])

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Sweeps Pendentes</Text>
          <Text style={styles.subtitle}>
            {stats.pending} pendente{stats.pending !== 1 ? 's' : ''}, {stats.ready} pronto
            {stats.ready !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Select All / Sweep Selected */}
        {actionableSweeps.length > 0 && (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.selectAllButton} onPress={handleSelectAll}>
              <Text style={styles.selectAllText}>
                {selectedIds.size === actionableSweeps.length ? '☑ Todos' : '☐ Selecionar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatSats(stats.totalValue)}</Text>
          <Text style={styles.statLabel}>Valor Total</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatSats(stats.totalFee)}</Text>
          <Text style={styles.statLabel}>Fees Estimadas</Text>
        </View>
      </View>

      {/* Urgent Alert */}
      {stats.urgent > 0 && (
        <View style={styles.urgentAlert}>
          <Text style={styles.urgentAlertTitle}>
            ⚠️ {stats.urgent} sweep{stats.urgent > 1 ? 's' : ''} com urgência
          </Text>
          <Text style={styles.urgentAlertText}>Timelocks expirando em breve - aja rapidamente</Text>
        </View>
      )}

      {/* Sweep Selected Button */}
      {selectedIds.size > 0 && (
        <TouchableOpacity style={styles.sweepAllButton} onPress={handleSweepSelected}>
          <Text style={styles.sweepAllButtonText}>
            Sweep {selectedIds.size} Selecionado{selectedIds.size > 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      )}

      {/* List */}
      <FlatList
        data={sweeps}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={handleRefresh}
            tintColor="#F7931A"
            colors={['#F7931A']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✨</Text>
            <Text style={styles.emptyTitle}>Nenhum Sweep Pendente</Text>
            <Text style={styles.emptySubtitle}>
              Todos os seus fundos estão seguros e disponíveis
            </Text>
          </View>
        }
      />
    </View>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
  },
  selectAllText: {
    fontSize: 14,
    color: '#F7931A',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#888888',
  },
  urgentAlert: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  urgentAlertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F44336',
  },
  urgentAlertText: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
  },
  sweepAllButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sweepAllButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: '#F7931A',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  checkbox: {
    padding: 4,
  },
  checkboxInner: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#888888',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#F7931A',
    borderColor: '#F7931A',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  typeIcon: {
    fontSize: 24,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  peerAlias: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  netAmount: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timelockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  timelockBarUrgent: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  timelockIcon: {
    fontSize: 12,
  },
  timelockText: {
    fontSize: 12,
    color: '#FFC107',
  },
  timelockTextUrgent: {
    color: '#F44336',
  },
  outpointRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  outpointLabel: {
    fontSize: 12,
    color: '#888888',
  },
  outpointValue: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'monospace',
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  feeLabel: {
    fontSize: 12,
    color: '#888888',
  },
  feeValue: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  adjustFeeLink: {
    fontSize: 12,
    color: '#F7931A',
    marginLeft: 8,
  },
  sweepTxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sweepTxLabel: {
    fontSize: 12,
    color: '#888888',
  },
  sweepTxValue: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'monospace',
  },
  confirmations: {
    fontSize: 10,
    color: '#4CAF50',
  },
  errorBox: {
    padding: 8,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 6,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
  },
  sweepButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  sweepButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
})

export default PendingSweeps
