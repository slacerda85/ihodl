/**
 * SwapProgress - Componente de progresso de Submarine Swap
 *
 * Exibe o progresso de um swap em andamento com estados visuais
 * e ações disponíveis para cada etapa.
 *
 * Otimizado para React 19 e React Compiler.
 */

import { memo, useMemo, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'

import { SwapData, SwapState, SwapType } from '@/core/lib/lightning/submarineSwap'
import { formatSats } from './utils'

// ==========================================
// TYPES
// ==========================================

interface SwapProgressProps {
  /** Dados do swap */
  swap: SwapData
  /** Callback quando swap completa */
  onComplete?: (swapId: string) => void
  /** Callback para cancelar/voltar */
  onCancel?: () => void
  /** Callback para tentar refund */
  onRefund?: (swapId: string) => void
}

interface StepInfo {
  label: string
  description: string
  isActive: boolean
  isComplete: boolean
  isFailed?: boolean
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getSwapStateLabel(state: SwapState): string {
  const labels: Record<SwapState, string> = {
    [SwapState.CREATED]: 'Criado',
    [SwapState.FUNDED]: 'Financiado',
    [SwapState.CONFIRMED]: 'Confirmado',
    [SwapState.COMPLETED]: 'Completo',
    [SwapState.EXPIRED]: 'Expirado',
    [SwapState.REFUNDED]: 'Reembolsado',
    [SwapState.FAILED]: 'Falhou',
  }
  return labels[state] || 'Desconhecido'
}

function getSwapStateIcon(state: SwapState): string {
  const icons: Record<SwapState, string> = {
    [SwapState.CREATED]: '🔵',
    [SwapState.FUNDED]: '🟡',
    [SwapState.CONFIRMED]: '🟠',
    [SwapState.COMPLETED]: '🟢',
    [SwapState.EXPIRED]: '⚫',
    [SwapState.REFUNDED]: '🔴',
    [SwapState.FAILED]: '❌',
  }
  return icons[state] || '⚪'
}

function formatTimeRemaining(locktime: number): string {
  // Assume ~10 min por bloco
  const now = Date.now() / 1000
  const estimatedTime = locktime * 600 // rough estimate
  const remaining = Math.max(0, estimatedTime - now)

  if (remaining <= 0) return 'Expirado'

  const hours = Math.floor(remaining / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `~${days}d ${hours % 24}h`
  }
  if (hours > 0) {
    return `~${hours}h ${minutes}m`
  }
  return `~${minutes}m`
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

interface StepIndicatorProps {
  steps: StepInfo[]
}

const StepIndicator = memo(function StepIndicator({ steps }: StepIndicatorProps) {
  return (
    <View style={styles.stepsContainer}>
      {steps.map((step, index) => (
        <View key={index} style={styles.stepWrapper}>
          <View style={styles.stepRow}>
            {/* Círculo do passo */}
            <View
              style={[
                styles.stepCircle,
                step.isComplete && styles.stepCircleComplete,
                step.isActive && styles.stepCircleActive,
                step.isFailed && styles.stepCircleFailed,
              ]}
            >
              {step.isComplete ? (
                <Text style={styles.stepCheck}>✓</Text>
              ) : step.isFailed ? (
                <Text style={styles.stepCheck}>✕</Text>
              ) : step.isActive ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.stepNumber}>{index + 1}</Text>
              )}
            </View>

            {/* Texto do passo */}
            <View style={styles.stepTextContainer}>
              <Text
                style={[
                  styles.stepLabel,
                  step.isActive && styles.stepLabelActive,
                  step.isComplete && styles.stepLabelComplete,
                  step.isFailed && styles.stepLabelFailed,
                ]}
              >
                {step.label}
              </Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </View>
          </View>

          {/* Linha conectora */}
          {index < steps.length - 1 && (
            <View style={[styles.stepLine, step.isComplete && styles.stepLineComplete]} />
          )}
        </View>
      ))}
    </View>
  )
})

interface SwapDetailsProps {
  swap: SwapData
}

const SwapDetails = memo(function SwapDetails({ swap }: SwapDetailsProps) {
  return (
    <View style={styles.detailsContainer}>
      <Text style={styles.detailsTitle}>Detalhes do Swap</Text>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Tipo</Text>
        <Text style={styles.detailValue}>
          {swap.type === SwapType.FORWARD ? '⬇️ Loop In' : '⬆️ Loop Out'}
        </Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Valor On-chain</Text>
        <Text style={styles.detailValue}>{formatSats(swap.onchainAmountSat)}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>Valor Lightning</Text>
        <Text style={styles.detailValue}>{formatSats(swap.lightningAmountSat)}</Text>
      </View>

      {swap.lockupAddress && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Endereço de Lockup</Text>
          <Text style={[styles.detailValue, styles.monoText]} numberOfLines={1}>
            {swap.lockupAddress}
          </Text>
        </View>
      )}

      {swap.locktime > 0 && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Tempo Restante</Text>
          <Text style={styles.detailValue}>{formatTimeRemaining(swap.locktime)}</Text>
        </View>
      )}

      {swap.fundingTxid && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>TX Funding</Text>
          <Text style={[styles.detailValue, styles.monoText]} numberOfLines={1}>
            {swap.fundingTxid.slice(0, 16)}...
          </Text>
        </View>
      )}

      {swap.spendingTxid && (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>TX Spending</Text>
          <Text style={[styles.detailValue, styles.monoText]} numberOfLines={1}>
            {swap.spendingTxid.slice(0, 16)}...
          </Text>
        </View>
      )}
    </View>
  )
})

// ==========================================
// MAIN COMPONENT
// ==========================================

function SwapProgress({ swap, onComplete, onCancel, onRefund }: SwapProgressProps) {
  // Calcular passos baseado no tipo e estado
  const steps = useMemo((): StepInfo[] => {
    const isForward = swap.type === SwapType.FORWARD
    const state = swap.state

    if (isForward) {
      // Loop In: Chain → Lightning
      return [
        {
          label: 'Swap Criado',
          description: 'Aguardando pagamento on-chain',
          isActive: state === SwapState.CREATED,
          isComplete: [SwapState.FUNDED, SwapState.CONFIRMED, SwapState.COMPLETED].includes(state),
          isFailed: [SwapState.FAILED, SwapState.EXPIRED].includes(state),
        },
        {
          label: 'TX Confirmada',
          description: 'Aguardando confirmações na blockchain',
          isActive: state === SwapState.FUNDED,
          isComplete: [SwapState.CONFIRMED, SwapState.COMPLETED].includes(state),
          isFailed: state === SwapState.FAILED,
        },
        {
          label: 'Pagamento Lightning',
          description: 'Enviando para sua carteira Lightning',
          isActive: state === SwapState.CONFIRMED,
          isComplete: state === SwapState.COMPLETED,
          isFailed: state === SwapState.FAILED,
        },
        {
          label: 'Concluído',
          description: 'Swap completado com sucesso',
          isActive: false,
          isComplete: state === SwapState.COMPLETED,
        },
      ]
    } else {
      // Loop Out: Lightning → Chain
      return [
        {
          label: 'Swap Criado',
          description: 'Aguardando pagamento Lightning',
          isActive: state === SwapState.CREATED,
          isComplete: [SwapState.FUNDED, SwapState.CONFIRMED, SwapState.COMPLETED].includes(state),
          isFailed: [SwapState.FAILED, SwapState.EXPIRED].includes(state),
        },
        {
          label: 'Invoice Paga',
          description: 'Preimage recebida, criando TX on-chain',
          isActive: state === SwapState.FUNDED,
          isComplete: [SwapState.CONFIRMED, SwapState.COMPLETED].includes(state),
          isFailed: state === SwapState.FAILED,
        },
        {
          label: 'TX Broadcast',
          description: 'Aguardando confirmações',
          isActive: state === SwapState.CONFIRMED,
          isComplete: state === SwapState.COMPLETED,
          isFailed: state === SwapState.FAILED,
        },
        {
          label: 'Concluído',
          description: 'Fundos recebidos on-chain',
          isActive: false,
          isComplete: state === SwapState.COMPLETED,
        },
      ]
    }
  }, [swap.type, swap.state])

  // Estado final?
  const isFinalState = useMemo(() => {
    return [SwapState.COMPLETED, SwapState.REFUNDED, SwapState.FAILED].includes(swap.state)
  }, [swap.state])

  // Pode tentar refund?
  const canRefund = useMemo(() => {
    return swap.state === SwapState.EXPIRED
  }, [swap.state])

  // Handlers
  const handleComplete = useCallback(() => {
    onComplete?.(swap.paymentHash)
  }, [swap.paymentHash, onComplete])

  const handleRefund = useCallback(() => {
    onRefund?.(swap.paymentHash)
  }, [swap.paymentHash, onRefund])

  return (
    <View style={styles.container}>
      {/* Header com status */}
      <View style={styles.header}>
        <Text style={styles.statusIcon}>{getSwapStateIcon(swap.state)}</Text>
        <Text style={styles.statusLabel}>{getSwapStateLabel(swap.state)}</Text>
      </View>

      {/* Indicador de passos */}
      <StepIndicator steps={steps} />

      {/* Detalhes do swap */}
      <SwapDetails swap={swap} />

      {/* Ações */}
      <View style={styles.actionsContainer}>
        {/* Botão de refund se expirado */}
        {canRefund && onRefund && (
          <TouchableOpacity style={[styles.button, styles.refundButton]} onPress={handleRefund}>
            <Text style={styles.buttonText}>Solicitar Reembolso</Text>
          </TouchableOpacity>
        )}

        {/* Botão de concluir se completado */}
        {swap.state === SwapState.COMPLETED && (
          <TouchableOpacity style={[styles.button, styles.completeButton]} onPress={handleComplete}>
            <Text style={styles.buttonText}>Concluído ✓</Text>
          </TouchableOpacity>
        )}

        {/* Botão de voltar */}
        {onCancel && (
          <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
            <Text style={[styles.buttonText, styles.cancelButtonText]}>
              {isFinalState ? 'Fechar' : 'Voltar'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Aviso para swaps em andamento */}
      {!isFinalState && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>⚠️ Swap em andamento</Text>
          <Text style={styles.warningSubtext}>
            Não feche o app. O progresso será atualizado automaticamente.
          </Text>
        </View>
      )}
    </View>
  )
}

export default memo(SwapProgress)

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
  },
  statusIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  stepsContainer: {
    marginBottom: 24,
  },
  stepWrapper: {
    marginBottom: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepCircleActive: {
    backgroundColor: '#F7931A',
  },
  stepCircleComplete: {
    backgroundColor: '#2ecc71',
  },
  stepCircleFailed: {
    backgroundColor: '#e74c3c',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  stepCheck: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  stepTextContainer: {
    flex: 1,
    paddingTop: 4,
  },
  stepLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
  },
  stepLabelActive: {
    color: '#F7931A',
  },
  stepLabelComplete: {
    color: '#2ecc71',
  },
  stepLabelFailed: {
    color: '#e74c3c',
  },
  stepDescription: {
    fontSize: 12,
    color: '#999',
  },
  stepLine: {
    width: 2,
    height: 20,
    backgroundColor: '#ddd',
    marginLeft: 15,
    marginVertical: 4,
  },
  stepLineComplete: {
    backgroundColor: '#2ecc71',
  },
  detailsContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    maxWidth: '60%',
    textAlign: 'right',
  },
  monoText: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  actionsContainer: {
    gap: 12,
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  completeButton: {
    backgroundColor: '#2ecc71',
  },
  refundButton: {
    backgroundColor: '#e74c3c',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButtonText: {
    color: '#666',
  },
  warningContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 4,
  },
  warningSubtext: {
    fontSize: 12,
    color: '#856404',
  },
})
