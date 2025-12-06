/**
 * RecurringPayments Component
 *
 * Gerencia pagamentos recorrentes usando BOLT 12 Offers.
 * Permite criar, visualizar e gerenciar assinaturas e pagamentos automáticos.
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
  Modal,
  TextInput,
  Switch,
} from 'react-native'

// ============================================================================
// Tipos
// ============================================================================

/**
 * Frequência do pagamento recorrente
 */
export enum RecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

/**
 * Status do pagamento recorrente
 */
export enum RecurringPaymentStatus {
  /** Ativo - pagamentos sendo processados */
  ACTIVE = 'active',
  /** Pausado pelo usuário */
  PAUSED = 'paused',
  /** Falhou no último pagamento */
  FAILED = 'failed',
  /** Expirado - offer não mais válida */
  EXPIRED = 'expired',
  /** Cancelado */
  CANCELLED = 'cancelled',
}

/**
 * Histórico de um pagamento individual
 */
export interface PaymentHistoryEntry {
  /** ID do pagamento */
  id: string
  /** Timestamp */
  timestamp: number
  /** Valor pago em msats */
  amountMsat: bigint
  /** Hash do pagamento */
  paymentHash: string
  /** Preimage (se sucesso) */
  preimage?: string
  /** Status */
  success: boolean
  /** Erro, se houver */
  error?: string
  /** Fee paga em msats */
  feeMsat?: bigint
}

/**
 * Dados de um pagamento recorrente
 */
export interface RecurringPayment {
  /** ID único */
  id: string
  /** Nome/descrição */
  name: string
  /** Offer string (BOLT 12) */
  offerString: string
  /** Node ID do receptor */
  recipientNodeId: string
  /** Alias do receptor */
  recipientAlias?: string
  /** Valor em msats (pode ser variável) */
  amountMsat: bigint
  /** Frequência */
  frequency: RecurrenceFrequency
  /** Status */
  status: RecurringPaymentStatus
  /** Data do próximo pagamento */
  nextPaymentAt: number
  /** Data do último pagamento */
  lastPaymentAt?: number
  /** Número de pagamentos realizados */
  paymentCount: number
  /** Total pago em msats */
  totalPaidMsat: bigint
  /** Limite de pagamentos (0 = ilimitado) */
  maxPayments: number
  /** Histórico de pagamentos */
  history: PaymentHistoryEntry[]
  /** Timestamp de criação */
  createdAt: number
  /** Timestamp de expiração da offer */
  offerExpiresAt?: number
  /** Se foi criado automaticamente */
  autoCreated: boolean
  /** Notas do usuário */
  notes?: string
}

/**
 * Configuração para criar pagamento recorrente
 */
export interface CreateRecurringPaymentConfig {
  name: string
  offerString: string
  amountMsat: bigint
  frequency: RecurrenceFrequency
  maxPayments?: number
  notes?: string
}

export interface RecurringPaymentsProps {
  /** Lista de pagamentos recorrentes */
  payments: RecurringPayment[]
  /** Se está carregando */
  loading?: boolean
  /** Callback para refresh */
  onRefresh?: () => Promise<void>
  /** Callback para criar novo */
  onCreate?: (config: CreateRecurringPaymentConfig) => Promise<void>
  /** Callback para pausar/retomar */
  onTogglePause?: (paymentId: string) => Promise<void>
  /** Callback para cancelar */
  onCancel?: (paymentId: string) => Promise<void>
  /** Callback para executar pagamento manual */
  onPayNow?: (paymentId: string) => Promise<void>
  /** Callback para ver detalhes */
  onDetails?: (payment: RecurringPayment) => void
}

// ============================================================================
// Helpers
// ============================================================================

function getFrequencyLabel(freq: RecurrenceFrequency): string {
  switch (freq) {
    case RecurrenceFrequency.DAILY:
      return 'Diário'
    case RecurrenceFrequency.WEEKLY:
      return 'Semanal'
    case RecurrenceFrequency.BIWEEKLY:
      return 'Quinzenal'
    case RecurrenceFrequency.MONTHLY:
      return 'Mensal'
    case RecurrenceFrequency.QUARTERLY:
      return 'Trimestral'
    case RecurrenceFrequency.YEARLY:
      return 'Anual'
    default:
      return 'Desconhecido'
  }
}

function getStatusLabel(status: RecurringPaymentStatus): string {
  switch (status) {
    case RecurringPaymentStatus.ACTIVE:
      return 'Ativo'
    case RecurringPaymentStatus.PAUSED:
      return 'Pausado'
    case RecurringPaymentStatus.FAILED:
      return 'Falhou'
    case RecurringPaymentStatus.EXPIRED:
      return 'Expirado'
    case RecurringPaymentStatus.CANCELLED:
      return 'Cancelado'
    default:
      return 'Desconhecido'
  }
}

function getStatusColor(status: RecurringPaymentStatus): string {
  switch (status) {
    case RecurringPaymentStatus.ACTIVE:
      return '#4CAF50'
    case RecurringPaymentStatus.PAUSED:
      return '#FFC107'
    case RecurringPaymentStatus.FAILED:
      return '#F44336'
    case RecurringPaymentStatus.EXPIRED:
      return '#888888'
    case RecurringPaymentStatus.CANCELLED:
      return '#888888'
    default:
      return '#888888'
  }
}

function formatMsats(msats: bigint): string {
  const sats = Number(msats) / 1000
  if (sats >= 100000000) {
    return `${(sats / 100000000).toFixed(8)} BTC`
  }
  if (sats >= 1000) {
    return `${(sats / 1000).toFixed(3)}k sats`
  }
  return `${sats.toFixed(0)} sats`
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTimeUntilNext(nextAt: number): string {
  const now = Date.now()
  const diff = nextAt - now

  if (diff <= 0) return 'Agora'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (days > 0) return `em ${days} dia${days > 1 ? 's' : ''}`
  if (hours > 0) return `em ${hours} hora${hours > 1 ? 's' : ''}`

  const minutes = Math.floor(diff / (1000 * 60))
  return `em ${minutes} min`
}

// ============================================================================
// Sub-componentes
// ============================================================================

interface PaymentCardProps {
  payment: RecurringPayment
  onTogglePause: () => void
  onCancel: () => void
  onPayNow: () => void
  onDetails: () => void
}

function PaymentCard({
  payment,
  onTogglePause,
  onCancel,
  onPayNow,
  onDetails,
}: PaymentCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const isActive = payment.status === RecurringPaymentStatus.ACTIVE

  const lastPaymentSuccess = useMemo(() => {
    if (payment.history.length === 0) return null
    return payment.history[payment.history.length - 1]
  }, [payment.history])

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.8}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.paymentName}>{payment.name}</Text>
          <Text style={styles.recipientAlias}>{payment.recipientAlias || 'Destinatário'}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <Text style={styles.amount}>{formatMsats(payment.amountMsat)}</Text>
          <Text style={styles.frequency}>{getFrequencyLabel(payment.frequency)}</Text>
        </View>
      </View>

      {/* Status & Next Payment */}
      <View style={styles.statusRow}>
        <View
          style={[styles.statusBadge, { backgroundColor: getStatusColor(payment.status) + '20' }]}
        >
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(payment.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(payment.status) }]}>
            {getStatusLabel(payment.status)}
          </Text>
        </View>

        {isActive && (
          <Text style={styles.nextPayment}>Próximo: {getTimeUntilNext(payment.nextPaymentAt)}</Text>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{payment.paymentCount}</Text>
          <Text style={styles.statLabel}>pagamentos</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatMsats(payment.totalPaidMsat)}</Text>
          <Text style={styles.statLabel}>total pago</Text>
        </View>
        {payment.maxPayments > 0 && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {payment.paymentCount}/{payment.maxPayments}
            </Text>
            <Text style={styles.statLabel}>limite</Text>
          </View>
        )}
      </View>

      {/* Expanded Content */}
      {expanded && (
        <>
          {/* Last Payment */}
          {lastPaymentSuccess && (
            <View style={styles.lastPaymentBox}>
              <Text style={styles.lastPaymentTitle}>Último pagamento</Text>
              <Text style={styles.lastPaymentDate}>
                {formatDateTime(lastPaymentSuccess.timestamp)}
              </Text>
              {lastPaymentSuccess.success ? (
                <Text style={styles.lastPaymentSuccess}>
                  ✓ {formatMsats(lastPaymentSuccess.amountMsat)} (fee:{' '}
                  {formatMsats(lastPaymentSuccess.feeMsat || 0n)})
                </Text>
              ) : (
                <Text style={styles.lastPaymentFailed}>✗ {lastPaymentSuccess.error}</Text>
              )}
            </View>
          )}

          {/* Notes */}
          {payment.notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Notas:</Text>
              <Text style={styles.notesText}>{payment.notes}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {(payment.status === RecurringPaymentStatus.ACTIVE ||
              payment.status === RecurringPaymentStatus.PAUSED) && (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={onTogglePause}>
                  <Text style={styles.actionButtonText}>
                    {payment.status === RecurringPaymentStatus.PAUSED ? '▶ Retomar' : '⏸ Pausar'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButtonPrimary} onPress={onPayNow}>
                  <Text style={styles.actionButtonPrimaryText}>Pagar Agora</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.actionButtonDanger} onPress={onCancel}>
              <Text style={styles.actionButtonDangerText}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          {/* Details Button */}
          <TouchableOpacity style={styles.detailsButton} onPress={onDetails}>
            <Text style={styles.detailsButtonText}>Ver Histórico Completo</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Expand Indicator */}
      <View style={styles.expandIndicator}>
        <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
      </View>
    </TouchableOpacity>
  )
}

interface CreateModalProps {
  visible: boolean
  onClose: () => void
  onCreate: (config: CreateRecurringPaymentConfig) => void
}

function CreateModal({ visible, onClose, onCreate }: CreateModalProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [offerString, setOfferString] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(RecurrenceFrequency.MONTHLY)
  const [hasLimit, setHasLimit] = useState(false)
  const [maxPayments, setMaxPayments] = useState('')
  const [notes, setNotes] = useState('')

  const handleCreate = () => {
    if (!name.trim() || !offerString.trim() || !amount.trim()) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios')
      return
    }

    const amountNum = parseInt(amount, 10)
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Erro', 'Valor inválido')
      return
    }

    onCreate({
      name: name.trim(),
      offerString: offerString.trim(),
      amountMsat: BigInt(amountNum) * 1000n, // sats to msats
      frequency,
      maxPayments: hasLimit ? parseInt(maxPayments, 10) || 0 : 0,
      notes: notes.trim() || undefined,
    })

    // Reset form
    setName('')
    setOfferString('')
    setAmount('')
    setFrequency(RecurrenceFrequency.MONTHLY)
    setHasLimit(false)
    setMaxPayments('')
    setNotes('')
    onClose()
  }

  const frequencies = [
    { value: RecurrenceFrequency.DAILY, label: 'Diário' },
    { value: RecurrenceFrequency.WEEKLY, label: 'Semanal' },
    { value: RecurrenceFrequency.BIWEEKLY, label: 'Quinzenal' },
    { value: RecurrenceFrequency.MONTHLY, label: 'Mensal' },
    { value: RecurrenceFrequency.QUARTERLY, label: 'Trimestral' },
    { value: RecurrenceFrequency.YEARLY, label: 'Anual' },
  ]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Novo Pagamento Recorrente</Text>
          <TouchableOpacity onPress={handleCreate}>
            <Text style={styles.modalSave}>Criar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modalContent}>
          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nome *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ex: Assinatura Podcast"
              placeholderTextColor="#666666"
            />
          </View>

          {/* Offer String */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Offer (BOLT 12) *</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={offerString}
              onChangeText={setOfferString}
              placeholder="lno1..."
              placeholderTextColor="#666666"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Amount */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Valor (sats) *</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="1000"
              placeholderTextColor="#666666"
              keyboardType="numeric"
            />
          </View>

          {/* Frequency */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Frequência</Text>
            <View style={styles.frequencyButtons}>
              {frequencies.map(f => (
                <TouchableOpacity
                  key={f.value}
                  style={[
                    styles.frequencyButton,
                    frequency === f.value && styles.frequencyButtonActive,
                  ]}
                  onPress={() => setFrequency(f.value)}
                >
                  <Text
                    style={[
                      styles.frequencyButtonText,
                      frequency === f.value && styles.frequencyButtonTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Limit */}
          <View style={styles.inputGroupRow}>
            <Text style={styles.inputLabel}>Limite de pagamentos</Text>
            <Switch
              value={hasLimit}
              onValueChange={setHasLimit}
              trackColor={{ false: '#333333', true: '#F7931A' }}
            />
          </View>

          {hasLimit && (
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                value={maxPayments}
                onChangeText={setMaxPayments}
                placeholder="Número máximo de pagamentos"
                placeholderTextColor="#666666"
                keyboardType="numeric"
              />
            </View>
          )}

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Notas (opcional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Observações..."
              placeholderTextColor="#666666"
              multiline
              numberOfLines={2}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ============================================================================
// Componente Principal
// ============================================================================

export function RecurringPayments({
  payments,
  loading = false,
  onRefresh,
  onCreate,
  onTogglePause,
  onCancel,
  onPayNow,
  onDetails,
}: RecurringPaymentsProps): React.JSX.Element {
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Estatísticas
  const stats = useMemo(() => {
    const active = payments.filter(p => p.status === RecurringPaymentStatus.ACTIVE).length
    const totalMonthly = payments
      .filter(p => p.status === RecurringPaymentStatus.ACTIVE)
      .reduce((acc, p) => {
        // Normalizar para mensal
        let multiplier = 1n
        switch (p.frequency) {
          case RecurrenceFrequency.DAILY:
            multiplier = 30n
            break
          case RecurrenceFrequency.WEEKLY:
            multiplier = 4n
            break
          case RecurrenceFrequency.BIWEEKLY:
            multiplier = 2n
            break
          case RecurrenceFrequency.MONTHLY:
            multiplier = 1n
            break
          case RecurrenceFrequency.QUARTERLY:
            multiplier = 1n
            break
          case RecurrenceFrequency.YEARLY:
            multiplier = 1n
            break
        }
        return acc + p.amountMsat * multiplier
      }, 0n)

    return { active, totalMonthly }
  }, [payments])

  // Handlers
  const handleRefresh = useCallback(async () => {
    await onRefresh?.()
  }, [onRefresh])

  const handleCreate = useCallback(
    async (config: CreateRecurringPaymentConfig) => {
      try {
        await onCreate?.(config)
      } catch (error) {
        Alert.alert('Erro', `Falha ao criar: ${error}`)
      }
    },
    [onCreate],
  )

  const handleTogglePause = useCallback(
    async (paymentId: string) => {
      try {
        await onTogglePause?.(paymentId)
      } catch (error) {
        Alert.alert('Erro', `Falha: ${error}`)
      }
    },
    [onTogglePause],
  )

  const handleCancel = useCallback(
    (paymentId: string, name: string) => {
      Alert.alert('Cancelar Pagamento', `Cancelar "${name}"? Esta ação não pode ser desfeita.`, [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await onCancel?.(paymentId)
            } catch (error) {
              Alert.alert('Erro', `Falha ao cancelar: ${error}`)
            }
          },
        },
      ])
    },
    [onCancel],
  )

  const handlePayNow = useCallback(
    async (paymentId: string) => {
      Alert.alert('Pagar Agora', 'Executar este pagamento agora?', [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Pagar',
          onPress: async () => {
            try {
              await onPayNow?.(paymentId)
            } catch (error) {
              Alert.alert('Erro', `Falha no pagamento: ${error}`)
            }
          },
        },
      ])
    },
    [onPayNow],
  )

  // Render
  const renderItem = useCallback(
    ({ item }: { item: RecurringPayment }) => (
      <PaymentCard
        payment={item}
        onTogglePause={() => handleTogglePause(item.id)}
        onCancel={() => handleCancel(item.id, item.name)}
        onPayNow={() => handlePayNow(item.id)}
        onDetails={() => onDetails?.(item)}
      />
    ),
    [handleTogglePause, handleCancel, handlePayNow, onDetails],
  )

  const keyExtractor = useCallback((item: RecurringPayment) => item.id, [])

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Pagamentos Recorrentes</Text>
          <Text style={styles.subtitle}>
            {stats.active} ativo{stats.active !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowCreateModal(true)}>
          <Text style={styles.addButtonText}>+ Novo</Text>
        </TouchableOpacity>
      </View>

      {/* Monthly Summary */}
      {stats.active > 0 && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Gasto mensal estimado</Text>
          <Text style={styles.summaryValue}>{formatMsats(stats.totalMonthly)}</Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={payments}
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
            <Text style={styles.emptyIcon}>🔄</Text>
            <Text style={styles.emptyTitle}>Nenhum Pagamento Recorrente</Text>
            <Text style={styles.emptySubtitle}>
              Configure pagamentos automáticos usando BOLT 12 Offers
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => setShowCreateModal(true)}>
              <Text style={styles.emptyButtonText}>Criar Primeiro Pagamento</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Create Modal */}
      <CreateModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
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
  addButton: {
    backgroundColor: '#F7931A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#888888',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F7931A',
    marginTop: 4,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeaderLeft: {},
  cardHeaderRight: {
    alignItems: 'flex-end',
  },
  paymentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  recipientAlias: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  frequency: {
    fontSize: 12,
    color: '#F7931A',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  nextPayment: {
    fontSize: 12,
    color: '#888888',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  stat: {
    flex: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 10,
    color: '#888888',
    marginTop: 2,
  },
  lastPaymentBox: {
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  lastPaymentTitle: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 4,
  },
  lastPaymentDate: {
    fontSize: 12,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  lastPaymentSuccess: {
    fontSize: 12,
    color: '#4CAF50',
  },
  lastPaymentFailed: {
    fontSize: 12,
    color: '#F44336',
  },
  notesBox: {
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  notesLabel: {
    fontSize: 10,
    color: '#888888',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  actionButtonPrimary: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionButtonDanger: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#F44336',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonDangerText: {
    fontSize: 14,
    color: '#F44336',
  },
  detailsButton: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  detailsButtonText: {
    fontSize: 14,
    color: '#888888',
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 8,
  },
  expandIcon: {
    fontSize: 12,
    color: '#888888',
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
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: '#F7931A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  modalCancel: {
    fontSize: 16,
    color: '#888888',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F7931A',
  },
  modalContent: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputGroupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333333',
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  frequencyButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#333333',
  },
  frequencyButtonActive: {
    backgroundColor: '#F7931A',
  },
  frequencyButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  frequencyButtonTextActive: {
    fontWeight: '600',
  },
})

export default RecurringPayments
