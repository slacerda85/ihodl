/**
 * ForceCloseStatus Component
 *
 * Exibe o status de force closes em andamento, incluindo:
 * - Progresso de confirmações
 * - Outputs pendentes de sweep
 * - Timelocks restantes
 * - Ações recomendadas
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native'

// ============================================================================
// Tipos
// ============================================================================

/**
 * Estado de um force close
 */
export enum ForceCloseState {
  /** Commitment TX broadcast, aguardando confirmação */
  PENDING_CONFIRMATION = 'pending_confirmation',
  /** Confirmado, aguardando CSV timeout */
  AWAITING_CSV = 'awaiting_csv',
  /** CSV expirado, pronto para sweep */
  READY_TO_SWEEP = 'ready_to_sweep',
  /** Sweep TX broadcast */
  SWEEPING = 'sweeping',
  /** Concluído */
  COMPLETED = 'completed',
  /** Erro */
  ERROR = 'error',
}

/**
 * Tipo de output a ser sweepado
 */
export enum OutputType {
  TO_LOCAL = 'to_local',
  TO_REMOTE = 'to_remote',
  HTLC_SUCCESS = 'htlc_success',
  HTLC_TIMEOUT = 'htlc_timeout',
  ANCHOR = 'anchor',
}

/**
 * Informações de um output pendente
 */
export interface PendingOutput {
  /** ID único */
  id: string
  /** Tipo de output */
  type: OutputType
  /** Valor em satoshis */
  amount: bigint
  /** Timelock (blocos restantes) */
  timelockBlocks: number
  /** Tempo estimado até desbloqueio */
  estimatedUnlockTime?: number
  /** Pronto para sweep? */
  canSweep: boolean
  /** Sweep txid (se já broadcast) */
  sweepTxid?: string
  /** Confirmações do sweep */
  sweepConfirmations?: number
}

/**
 * Dados de um force close
 */
export interface ForceCloseData {
  /** Channel ID */
  channelId: string
  /** Alias do peer */
  peerAlias?: string
  /** Node ID do peer */
  peerId: string
  /** Estado atual */
  state: ForceCloseState
  /** Commitment txid */
  commitmentTxid: string
  /** Confirmações da commitment tx */
  commitmentConfirmations: number
  /** Confirmações necessárias */
  requiredConfirmations: number
  /** Outputs pendentes */
  pendingOutputs: PendingOutput[]
  /** Valor total a recuperar */
  totalRecoverable: bigint
  /** Valor já recuperado */
  recoveredAmount: bigint
  /** Timestamp de início */
  startedAt: number
  /** Timestamp estimado de conclusão */
  estimatedCompletionAt?: number
  /** Erro, se houver */
  error?: string
}

export interface ForceCloseStatusProps {
  /** Dados dos force closes */
  forceCloses: ForceCloseData[]
  /** Se está carregando */
  loading?: boolean
  /** Callback para refresh */
  onRefresh?: () => Promise<void>
  /** Callback para executar sweep */
  onSweep?: (channelId: string, outputId: string) => Promise<void>
  /** Callback para ver detalhes */
  onDetails?: (forceClose: ForceCloseData) => void
  /** Callback para fee bumping */
  onFeeBump?: (channelId: string, outputId: string) => void
}

// ============================================================================
// Helpers
// ============================================================================

function getStateLabel(state: ForceCloseState): string {
  switch (state) {
    case ForceCloseState.PENDING_CONFIRMATION:
      return 'Aguardando Confirmação'
    case ForceCloseState.AWAITING_CSV:
      return 'Aguardando Timelock'
    case ForceCloseState.READY_TO_SWEEP:
      return 'Pronto para Sweep'
    case ForceCloseState.SWEEPING:
      return 'Sweeping...'
    case ForceCloseState.COMPLETED:
      return 'Concluído'
    case ForceCloseState.ERROR:
      return 'Erro'
    default:
      return 'Desconhecido'
  }
}

function getStateColor(state: ForceCloseState): string {
  switch (state) {
    case ForceCloseState.PENDING_CONFIRMATION:
      return '#FFC107'
    case ForceCloseState.AWAITING_CSV:
      return '#2196F3'
    case ForceCloseState.READY_TO_SWEEP:
      return '#4CAF50'
    case ForceCloseState.SWEEPING:
      return '#F7931A'
    case ForceCloseState.COMPLETED:
      return '#4CAF50'
    case ForceCloseState.ERROR:
      return '#F44336'
    default:
      return '#888888'
  }
}

function getOutputTypeLabel(type: OutputType): string {
  switch (type) {
    case OutputType.TO_LOCAL:
      return 'To Local'
    case OutputType.TO_REMOTE:
      return 'To Remote'
    case OutputType.HTLC_SUCCESS:
      return 'HTLC Success'
    case OutputType.HTLC_TIMEOUT:
      return 'HTLC Timeout'
    case OutputType.ANCHOR:
      return 'Anchor'
    default:
      return 'Desconhecido'
  }
}

function formatTimeRemaining(blocks: number): string {
  // Estimativa: 10 minutos por bloco
  const minutes = blocks * 10
  if (minutes < 60) return `~${minutes} min`
  if (minutes < 1440) return `~${Math.round(minutes / 60)} horas`
  return `~${Math.round(minutes / 1440)} dias`
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

function truncateTxid(txid: string): string {
  if (txid.length <= 16) return txid
  return `${txid.slice(0, 8)}...${txid.slice(-8)}`
}

// ============================================================================
// Sub-componentes
// ============================================================================

interface OutputCardProps {
  output: PendingOutput
  onSweep?: () => void
  onFeeBump?: () => void
}

function OutputCard({ output, onSweep, onFeeBump }: OutputCardProps): React.JSX.Element {
  const canTakeAction = output.canSweep && !output.sweepTxid

  return (
    <View style={styles.outputCard}>
      <View style={styles.outputHeader}>
        <Text style={styles.outputType}>{getOutputTypeLabel(output.type)}</Text>
        <Text style={styles.outputAmount}>{formatSats(output.amount)}</Text>
      </View>

      {output.timelockBlocks > 0 && (
        <View style={styles.timelockRow}>
          <Text style={styles.timelockIcon}>⏳</Text>
          <Text style={styles.timelockText}>
            {output.timelockBlocks} blocos restantes ({formatTimeRemaining(output.timelockBlocks)})
          </Text>
        </View>
      )}

      {output.sweepTxid && (
        <View style={styles.sweepRow}>
          <Text style={styles.sweepLabel}>Sweep TX:</Text>
          <Text style={styles.sweepTxid}>{truncateTxid(output.sweepTxid)}</Text>
          {output.sweepConfirmations !== undefined && (
            <Text style={styles.sweepConfs}>({output.sweepConfirmations} confs)</Text>
          )}
        </View>
      )}

      {canTakeAction && (
        <View style={styles.outputActions}>
          <TouchableOpacity style={styles.sweepButton} onPress={onSweep}>
            <Text style={styles.sweepButtonText}>Sweep</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.feeBumpButton} onPress={onFeeBump}>
            <Text style={styles.feeBumpButtonText}>Fee Bump</Text>
          </TouchableOpacity>
        </View>
      )}

      {!output.canSweep && output.timelockBlocks > 0 && (
        <View style={styles.lockedBadge}>
          <Text style={styles.lockedBadgeText}>🔒 Bloqueado</Text>
        </View>
      )}
    </View>
  )
}

interface ForceCloseCardProps {
  data: ForceCloseData
  onSweep?: (outputId: string) => void
  onFeeBump?: (outputId: string) => void
  onDetails?: () => void
}

function ForceCloseCard({
  data,
  onSweep,
  onFeeBump,
  onDetails,
}: ForceCloseCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(true)

  const progress = useMemo(() => {
    if (data.totalRecoverable === 0n) return 100
    return Number((data.recoveredAmount * 100n) / data.totalRecoverable)
  }, [data.recoveredAmount, data.totalRecoverable])

  const confirmationProgress = useMemo(() => {
    return Math.min(100, (data.commitmentConfirmations / data.requiredConfirmations) * 100)
  }, [data.commitmentConfirmations, data.requiredConfirmations])

  return (
    <View style={styles.card}>
      {/* Header */}
      <TouchableOpacity style={styles.cardHeader} onPress={() => setExpanded(!expanded)}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.stateDot, { backgroundColor: getStateColor(data.state) }]} />
          <View>
            <Text style={styles.peerAlias}>{data.peerAlias || 'Canal Desconhecido'}</Text>
            <Text style={styles.channelId}>{truncateTxid(data.channelId)}</Text>
          </View>
        </View>
        <View style={styles.cardHeaderRight}>
          <Text style={[styles.stateLabel, { color: getStateColor(data.state) }]}>
            {getStateLabel(data.state)}
          </Text>
          <Text style={styles.expandIcon}>{expanded ? '▼' : '▶'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          {/* Progress Section */}
          <View style={styles.progressSection}>
            {/* Confirmation Progress */}
            {data.state === ForceCloseState.PENDING_CONFIRMATION && (
              <View style={styles.progressBlock}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Confirmações</Text>
                  <Text style={styles.progressValue}>
                    {data.commitmentConfirmations}/{data.requiredConfirmations}
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${confirmationProgress}%` }]} />
                </View>
              </View>
            )}

            {/* Recovery Progress */}
            <View style={styles.progressBlock}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Recuperado</Text>
                <Text style={styles.progressValue}>
                  {formatSats(data.recoveredAmount)} / {formatSats(data.totalRecoverable)}
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, styles.progressFillGreen, { width: `${progress}%` }]}
                />
              </View>
            </View>
          </View>

          {/* Commitment TX Info */}
          <View style={styles.txInfo}>
            <Text style={styles.txLabel}>Commitment TX:</Text>
            <Text style={styles.txValue}>{truncateTxid(data.commitmentTxid)}</Text>
          </View>

          {/* Pending Outputs */}
          {data.pendingOutputs.length > 0 && (
            <View style={styles.outputsSection}>
              <Text style={styles.outputsTitle}>
                Outputs Pendentes ({data.pendingOutputs.length})
              </Text>
              {data.pendingOutputs.map(output => (
                <OutputCard
                  key={output.id}
                  output={output}
                  onSweep={() => onSweep?.(output.id)}
                  onFeeBump={() => onFeeBump?.(output.id)}
                />
              ))}
            </View>
          )}

          {/* Error Display */}
          {data.error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>❌ {data.error}</Text>
            </View>
          )}

          {/* Details Button */}
          <TouchableOpacity style={styles.detailsButton} onPress={onDetails}>
            <Text style={styles.detailsButtonText}>Ver Detalhes</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

// ============================================================================
// Componente Principal
// ============================================================================

export function ForceCloseStatus({
  forceCloses,
  loading = false,
  onRefresh,
  onSweep,
  onDetails,
  onFeeBump,
}: ForceCloseStatusProps): React.JSX.Element {
  const handleRefresh = useCallback(async () => {
    await onRefresh?.()
  }, [onRefresh])

  const handleSweep = useCallback(
    async (channelId: string, outputId: string) => {
      Alert.alert('Confirmar Sweep', 'Deseja executar o sweep deste output?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sweep',
          onPress: async () => {
            try {
              await onSweep?.(channelId, outputId)
            } catch (error) {
              Alert.alert('Erro', `Falha no sweep: ${error}`)
            }
          },
        },
      ])
    },
    [onSweep],
  )

  const handleFeeBump = useCallback(
    (channelId: string, outputId: string) => {
      onFeeBump?.(channelId, outputId)
    },
    [onFeeBump],
  )

  // Estatísticas
  const stats = useMemo(() => {
    const activeCount = forceCloses.filter(
      fc => fc.state !== ForceCloseState.COMPLETED && fc.state !== ForceCloseState.ERROR,
    ).length
    const totalRecoverable = forceCloses.reduce((acc, fc) => acc + fc.totalRecoverable, 0n)
    const totalRecovered = forceCloses.reduce((acc, fc) => acc + fc.recoveredAmount, 0n)
    const outputsReady = forceCloses.reduce(
      (acc, fc) => acc + fc.pendingOutputs.filter(o => o.canSweep && !o.sweepTxid).length,
      0,
    )

    return { activeCount, totalRecoverable, totalRecovered, outputsReady }
  }, [forceCloses])

  if (forceCloses.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>Nenhum Force Close</Text>
          <Text style={styles.emptySubtitle}>
            Não há canais em processo de force close no momento
          </Text>
        </View>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={handleRefresh}
          tintColor="#F7931A"
          colors={['#F7931A']}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Force Closes</Text>
        <Text style={styles.subtitle}>
          {stats.activeCount} ativo{stats.activeCount !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatSats(stats.totalRecoverable)}</Text>
          <Text style={styles.statLabel}>Total a Recuperar</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.statValueGreen]}>
            {formatSats(stats.totalRecovered)}
          </Text>
          <Text style={styles.statLabel}>Já Recuperado</Text>
        </View>
      </View>

      {/* Ready Alert */}
      {stats.outputsReady > 0 && (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>
            ✅ {stats.outputsReady} output{stats.outputsReady > 1 ? 's' : ''} pronto
            {stats.outputsReady > 1 ? 's' : ''} para sweep
          </Text>
          <Text style={styles.alertText}>Execute o sweep para recuperar seus fundos</Text>
        </View>
      )}

      {/* Force Close List */}
      {forceCloses.map(fc => (
        <ForceCloseCard
          key={fc.channelId}
          data={fc}
          onSweep={outputId => handleSweep(fc.channelId, outputId)}
          onFeeBump={outputId => handleFeeBump(fc.channelId, outputId)}
          onDetails={() => onDetails?.(fc)}
        />
      ))}
    </ScrollView>
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
  contentContainer: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
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
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statValueGreen: {
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 12,
    color: '#888888',
  },
  alertBox: {
    padding: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  alertText: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stateDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  peerAlias: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  channelId: {
    fontSize: 12,
    color: '#888888',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  stateLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  expandIcon: {
    fontSize: 12,
    color: '#888888',
  },
  progressSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  progressBlock: {
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: '#888888',
  },
  progressValue: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#333333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#F7931A',
    borderRadius: 3,
  },
  progressFillGreen: {
    backgroundColor: '#4CAF50',
  },
  txInfo: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  txLabel: {
    fontSize: 12,
    color: '#888888',
  },
  txValue: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'monospace',
  },
  outputsSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  outputsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  outputCard: {
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  outputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  outputType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  outputAmount: {
    fontSize: 14,
    color: '#F7931A',
    fontWeight: '600',
  },
  timelockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  timelockIcon: {
    fontSize: 12,
  },
  timelockText: {
    fontSize: 12,
    color: '#FFC107',
  },
  sweepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sweepLabel: {
    fontSize: 12,
    color: '#888888',
  },
  sweepTxid: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'monospace',
  },
  sweepConfs: {
    fontSize: 10,
    color: '#4CAF50',
  },
  outputActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  sweepButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  sweepButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  feeBumpButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#F7931A',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  feeBumpButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F7931A',
  },
  lockedBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 4,
  },
  lockedBadgeText: {
    fontSize: 12,
    color: '#FFC107',
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
  },
  detailsButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
  },
  detailsButtonText: {
    fontSize: 14,
    color: '#888888',
  },
  emptyContainer: {
    flex: 1,
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

export default ForceCloseStatus
