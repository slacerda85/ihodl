/**
 * HtlcMonitorScreen Component
 *
 * Tela para monitoramento de HTLCs pendentes.
 * Exibe lista de HTLCs, urgência e ações recomendadas.
 */

import React, { useCallback, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native'
import {
  useHtlcMonitor,
  formatTimeRemaining,
  getUrgencyColor,
  getActionLabel,
  type MonitoredHtlcInfo,
  type HtlcMonitorConfig,
} from './hooks/useHtlcMonitor'
import { HtlcMonitorState, HtlcAction } from '@/core/services/ln-htlc-service'

// ============================================================================
// Tipos
// ============================================================================

export interface HtlcMonitorScreenProps {
  /** Configuração do monitor */
  config: HtlcMonitorConfig
  /** Callback quando uma ação é selecionada */
  onAction?: (htlc: MonitoredHtlcInfo, action: HtlcAction) => void
  /** Callback para navegar aos detalhes */
  onHtlcPress?: (htlc: MonitoredHtlcInfo) => void
}

// ============================================================================
// Componente Principal
// ============================================================================

export function HtlcMonitorScreen({
  config,
  onAction,
  onHtlcPress,
}: HtlcMonitorScreenProps): React.JSX.Element {
  const { state, checkNow, startMonitoring, stopMonitoring, getUrgentHtlcs, getActionableHtlcs } =
    useHtlcMonitor(config)

  // HTLCs urgentes
  const urgentHtlcs = useMemo(() => getUrgentHtlcs(), [getUrgentHtlcs])
  const actionableHtlcs = useMemo(() => getActionableHtlcs(), [getActionableHtlcs])

  // Handlers
  const handleRefresh = useCallback(async () => {
    await checkNow()
  }, [checkNow])

  const handleToggleMonitoring = useCallback(() => {
    if (state.isMonitoring) {
      stopMonitoring()
    } else {
      startMonitoring()
    }
  }, [state.isMonitoring, startMonitoring, stopMonitoring])

  const handleHtlcPress = useCallback(
    (htlc: MonitoredHtlcInfo) => {
      onHtlcPress?.(htlc)
    },
    [onHtlcPress],
  )

  const handleActionPress = useCallback(
    (htlc: MonitoredHtlcInfo) => {
      if (htlc.recommendedAction === HtlcAction.NONE) return

      Alert.alert('Executar Ação', `Deseja executar: ${getActionLabel(htlc.recommendedAction)}?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Executar',
          onPress: () => onAction?.(htlc, htlc.recommendedAction),
        },
      ])
    },
    [onAction],
  )

  // Render item
  const renderHtlcItem = useCallback(
    ({ item }: { item: MonitoredHtlcInfo }) => (
      <HtlcCard
        htlc={item}
        onPress={() => handleHtlcPress(item)}
        onActionPress={() => handleActionPress(item)}
      />
    ),
    [handleHtlcPress, handleActionPress],
  )

  const keyExtractor = useCallback((item: MonitoredHtlcInfo) => item.id, [])

  // Render
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Monitor de HTLCs</Text>
          <Text style={styles.subtitle}>
            {state.htlcs.length} HTLC{state.htlcs.length !== 1 ? 's' : ''} monitorado
            {state.htlcs.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.monitorButton, state.isMonitoring && styles.monitorButtonActive]}
          onPress={handleToggleMonitoring}
        >
          <Text
            style={[styles.monitorButtonText, state.isMonitoring && styles.monitorButtonTextActive]}
          >
            {state.isMonitoring ? '⏸ Pausar' : '▶ Iniciar'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Última verificação</Text>
          <Text style={styles.statusValue}>
            {state.lastCheckAt ? new Date(state.lastCheckAt).toLocaleTimeString() : '--:--'}
          </Text>
        </View>
        {state.isMonitoring && state.nextCheckAt && (
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Próxima verificação</Text>
            <Text style={styles.statusValue}>
              {new Date(state.nextCheckAt).toLocaleTimeString()}
            </Text>
          </View>
        )}
      </View>

      {/* Urgent Alert */}
      {urgentHtlcs.length > 0 && (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>
            ⚠️ {urgentHtlcs.length} HTLC{urgentHtlcs.length > 1 ? 's' : ''} com urgência
          </Text>
          <Text style={styles.alertText}>Ação necessária para evitar perda de fundos</Text>
        </View>
      )}

      {/* Actionable Summary */}
      {actionableHtlcs.length > 0 && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>
            🔧 {actionableHtlcs.length} ação{actionableHtlcs.length > 1 ? 'ões' : ''} pendente
            {actionableHtlcs.length > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Error Display */}
      {state.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>❌ {state.error}</Text>
        </View>
      )}

      {/* HTLC List */}
      <FlatList
        data={state.htlcs}
        renderItem={renderHtlcItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={state.loading}
            onRefresh={handleRefresh}
            tintColor="#F7931A"
            colors={['#F7931A']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyTitle}>Nenhum HTLC monitorado</Text>
            <Text style={styles.emptySubtitle}>
              HTLCs pendentes aparecerão aqui quando houver transações Lightning em andamento
            </Text>
          </View>
        }
      />
    </View>
  )
}

// ============================================================================
// Sub-componentes
// ============================================================================

interface HtlcCardProps {
  htlc: MonitoredHtlcInfo
  onPress: () => void
  onActionPress: () => void
}

function HtlcCard({ htlc, onPress, onActionPress }: HtlcCardProps): React.JSX.Element {
  const urgencyColor = getUrgencyColor(htlc.urgency)
  const hasAction = htlc.recommendedAction !== HtlcAction.NONE

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Urgency Indicator */}
      <View style={[styles.urgencyIndicator, { backgroundColor: urgencyColor }]} />

      {/* Card Content */}
      <View style={styles.cardContent}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.directionBadge}>
              {htlc.direction === 'sent' ? '↗️ Enviado' : '↙️ Recebido'}
            </Text>
            <Text style={styles.htlcId}>#{htlc.htlcId}</Text>
          </View>
          <View style={[styles.stateBadge, { backgroundColor: getStateColor(htlc.state) }]}>
            <Text style={styles.stateBadgeText}>{getStateLabel(htlc.state)}</Text>
          </View>
        </View>

        {/* Amount & Expiry */}
        <View style={styles.cardBody}>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Valor</Text>
            <Text style={styles.infoValue}>{htlc.amountSat.toLocaleString()} sat</Text>
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.infoLabel}>Expira em</Text>
            <Text style={[styles.infoValue, { color: urgencyColor }]}>
              {formatTimeRemaining(htlc.blocksUntilExpiry)}
            </Text>
          </View>
        </View>

        {/* Payment Hash (truncated) */}
        <View style={styles.hashContainer}>
          <Text style={styles.hashLabel}>Payment Hash:</Text>
          <Text style={styles.hashValue} numberOfLines={1}>
            {htlc.paymentHash.substring(0, 32)}...
          </Text>
        </View>

        {/* Status Message */}
        <Text style={styles.statusMessage}>{htlc.statusMessage}</Text>

        {/* Action Button */}
        {hasAction && (
          <TouchableOpacity style={styles.actionButton} onPress={onActionPress} activeOpacity={0.7}>
            <Text style={styles.actionButtonText}>⚡ {getActionLabel(htlc.recommendedAction)}</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ============================================================================
// Utilitários
// ============================================================================

function getStateLabel(state: HtlcMonitorState): string {
  switch (state) {
    case HtlcMonitorState.PENDING:
      return 'Pendente'
    case HtlcMonitorState.ONCHAIN:
      return 'On-chain'
    case HtlcMonitorState.HTLC_TX_PUBLISHED:
      return 'TX Publicada'
    case HtlcMonitorState.RESOLVED:
      return 'Resolvido'
    case HtlcMonitorState.EXPIRED:
      return 'Expirado'
    case HtlcMonitorState.ERROR:
      return 'Erro'
    default:
      return 'Desconhecido'
  }
}

function getStateColor(state: HtlcMonitorState): string {
  switch (state) {
    case HtlcMonitorState.PENDING:
      return '#2196F3' // Blue
    case HtlcMonitorState.ONCHAIN:
      return '#FF9800' // Orange
    case HtlcMonitorState.HTLC_TX_PUBLISHED:
      return '#9C27B0' // Purple
    case HtlcMonitorState.RESOLVED:
      return '#4CAF50' // Green
    case HtlcMonitorState.EXPIRED:
      return '#F44336' // Red
    case HtlcMonitorState.ERROR:
      return '#F44336' // Red
    default:
      return '#757575' // Gray
  }
}

// ============================================================================
// Estilos
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
  },
  monitorButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#F7931A',
  },
  monitorButtonActive: {
    backgroundColor: '#F7931A',
  },
  monitorButtonText: {
    fontSize: 14,
    color: '#F7931A',
    fontWeight: '600',
  },
  monitorButtonTextActive: {
    color: '#FFFFFF',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 12,
    backgroundColor: '#1A1A1A',
  },
  statusItem: {
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#888888',
  },
  statusValue: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 2,
  },
  alertBox: {
    margin: 16,
    marginBottom: 0,
    padding: 12,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F44336',
  },
  alertText: {
    fontSize: 14,
    color: '#F44336',
    marginTop: 4,
  },
  summaryBox: {
    margin: 16,
    marginBottom: 0,
    padding: 12,
    backgroundColor: 'rgba(247, 147, 26, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F7931A',
  },
  summaryTitle: {
    fontSize: 14,
    color: '#F7931A',
  },
  errorBox: {
    margin: 16,
    marginBottom: 0,
    padding: 12,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  urgencyIndicator: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  directionBadge: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  htlcId: {
    fontSize: 12,
    color: '#888888',
  },
  stateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  stateBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  cardBody: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoColumn: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#888888',
  },
  infoValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: 2,
  },
  hashContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  hashLabel: {
    fontSize: 12,
    color: '#888888',
    marginRight: 4,
  },
  hashValue: {
    flex: 1,
    fontSize: 12,
    color: '#666666',
    fontFamily: 'monospace',
  },
  statusMessage: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 8,
  },
  actionButton: {
    backgroundColor: '#F7931A',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
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

export default HtlcMonitorScreen
