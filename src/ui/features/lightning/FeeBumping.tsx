/**
 * FeeBumping Component
 *
 * UI para realizar CPFP (Child-Pays-For-Parent) fee bumping
 * em transações Lightning pendentes.
 */

import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native'
import {
  useCpfp,
  formatFee,
  estimateConfirmationTime,
  isCpfpViable,
  MIN_FEE_RATE,
  MAX_FEE_RATE,
  TYPICAL_CPFP_SIZE_VB,
} from './hooks/useCpfp'

// ============================================================================
// Tipos
// ============================================================================

export interface FeeBumpingProps {
  /** Transação pendente para bump */
  transaction: PendingTransaction
  /** Callback quando CPFP é criado com sucesso */
  onSuccess?: (txid: string) => void
  /** Callback para cancelar */
  onCancel?: () => void
  /** Função de broadcast */
  broadcastTransaction?: (txHex: string) => Promise<string>
  /** Fee rates sugeridos */
  suggestedFeeRates?: FeeRateSuggestion
}

export interface PendingTransaction {
  /** TXID da transação */
  txid: string
  /** Tipo da transação */
  type: 'commitment' | 'htlc_success' | 'htlc_timeout' | 'sweep'
  /** Tamanho em vbytes */
  sizeVb: number
  /** Fee atual em satoshis */
  currentFeeSat: number
  /** Fee rate atual em sat/vB */
  currentFeeRate: number
  /** Output disponível para CPFP */
  spendableOutput?: {
    vout: number
    valueSat: bigint
    script: string
  }
  /** Descrição */
  description?: string
}

export interface FeeRateSuggestion {
  /** Taxa econômica (baixa prioridade) */
  economy: number
  /** Taxa normal */
  normal: number
  /** Taxa alta (próximo bloco) */
  high: number
  /** Taxa urgente */
  urgent: number
}

// ============================================================================
// Componente Principal
// ============================================================================

export function FeeBumping({
  transaction,
  onSuccess,
  onCancel,
  broadcastTransaction,
  suggestedFeeRates = { economy: 5, normal: 10, high: 25, urgent: 50 },
}: FeeBumpingProps): React.JSX.Element {
  const { state, calculateFee, broadcast, reset, setTargetFeeRate } = useCpfp()

  const [destinationAddress, setDestinationAddress] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [customFeeRate, setCustomFeeRate] = useState('')

  // Usar fee rate do estado ou o sugerido normal
  const effectiveFeeRate = state.targetFeeRate || suggestedFeeRates.normal

  // Verificar viabilidade
  const canBump = useMemo(() => {
    if (!transaction.spendableOutput) return false
    return isCpfpViable({
      outputValueSat: transaction.spendableOutput.valueSat,
      estimatedFeeSat:
        (transaction.sizeVb + TYPICAL_CPFP_SIZE_VB) * effectiveFeeRate - transaction.currentFeeSat,
    })
  }, [transaction, effectiveFeeRate])

  // Handlers
  const handleSelectFeeRate = useCallback(
    (rate: number) => {
      setTargetFeeRate(rate)
      setCustomFeeRate('')

      // Calcular fee preview
      if (transaction.spendableOutput) {
        calculateFee({
          parentTxid: transaction.txid,
          parentVsize: transaction.sizeVb,
          parentFeeRate: transaction.currentFeeRate,
          targetFeeRate: rate,
          childVsize: TYPICAL_CPFP_SIZE_VB,
        })
      }
    },
    [transaction, setTargetFeeRate, calculateFee],
  )

  const handleCustomFeeRate = useCallback(
    (text: string) => {
      setCustomFeeRate(text)
      const rate = parseInt(text, 10)
      if (!isNaN(rate) && rate >= MIN_FEE_RATE && rate <= MAX_FEE_RATE) {
        setTargetFeeRate(rate)
        if (transaction.spendableOutput) {
          calculateFee({
            parentTxid: transaction.txid,
            parentVsize: transaction.sizeVb,
            parentFeeRate: transaction.currentFeeRate,
            targetFeeRate: rate,
            childVsize: TYPICAL_CPFP_SIZE_VB,
          })
        }
      }
    },
    [transaction, setTargetFeeRate, calculateFee],
  )

  const handleCreateCpfp = useCallback(async () => {
    if (!transaction.spendableOutput || !destinationAddress || !privateKey) {
      Alert.alert('Erro', 'Preencha todos os campos obrigatórios')
      return
    }

    // Calcular fee necessária
    const feeResult = calculateFee({
      parentTxid: transaction.txid,
      parentVsize: transaction.sizeVb,
      parentFeeRate: transaction.currentFeeRate,
      targetFeeRate: effectiveFeeRate,
      childVsize: TYPICAL_CPFP_SIZE_VB,
    })

    if (!feeResult || !feeResult.isViable) {
      Alert.alert('Erro', 'CPFP não é viável para esta transação')
      return
    }

    // TODO: Integrar com serviço de construção de TX
    // Por agora, apenas mostra as informações calculadas
    Alert.alert(
      'CPFP Calculado',
      `Fee necessária: ${formatFee(feeResult.childFeeSat)}\n` +
        `Fee rate efetiva: ${feeResult.effectiveFeeRate.toFixed(2)} sat/vB\n\n` +
        'A construção da TX será implementada no serviço.',
    )
  }, [transaction, destinationAddress, privateKey, effectiveFeeRate, calculateFee])

  const handleBroadcast = useCallback(async () => {
    if (!broadcastTransaction) {
      Alert.alert('Erro', 'Função de broadcast não configurada')
      return
    }

    const txid = await broadcast(broadcastTransaction)
    if (txid) {
      Alert.alert('Sucesso', `Transação CPFP enviada: ${txid.substring(0, 16)}...`)
      onSuccess?.(txid)
    } else {
      Alert.alert('Erro', state.error || 'Falha ao enviar transação')
    }
  }, [broadcast, broadcastTransaction, onSuccess, state.error])

  const handleReset = useCallback(() => {
    reset()
    setDestinationAddress('')
    setPrivateKey('')
    setCustomFeeRate('')
  }, [reset])

  // Render
  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Fee Bumping (CPFP)</Text>
        <Text style={styles.subtitle}>
          Acelere sua transação criando uma child transaction com fee maior
        </Text>
      </View>

      {/* Transaction Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transação</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>TXID:</Text>
          <Text style={styles.value} numberOfLines={1}>
            {transaction.txid.substring(0, 24)}...
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Tipo:</Text>
          <Text style={styles.value}>{getTransactionTypeLabel(transaction.type)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Fee Atual:</Text>
          <Text style={styles.value}>
            {formatFee(transaction.currentFeeSat)} ({transaction.currentFeeRate} sat/vB)
          </Text>
        </View>
        {transaction.spendableOutput && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Output Disponível:</Text>
            <Text style={styles.value}>
              {formatFee(Number(transaction.spendableOutput.valueSat))}
            </Text>
          </View>
        )}
      </View>

      {/* Viability Check */}
      {!canBump && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            ⚠️ CPFP não é viável para esta transação. O output disponível não é suficiente para
            cobrir a fee necessária.
          </Text>
        </View>
      )}

      {/* Fee Rate Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Taxa de Fee</Text>

        <View style={styles.feeOptions}>
          <FeeOption
            label="Econômico"
            rate={suggestedFeeRates.economy}
            selected={effectiveFeeRate === suggestedFeeRates.economy}
            onSelect={() => handleSelectFeeRate(suggestedFeeRates.economy)}
          />
          <FeeOption
            label="Normal"
            rate={suggestedFeeRates.normal}
            selected={effectiveFeeRate === suggestedFeeRates.normal}
            onSelect={() => handleSelectFeeRate(suggestedFeeRates.normal)}
          />
          <FeeOption
            label="Rápido"
            rate={suggestedFeeRates.high}
            selected={effectiveFeeRate === suggestedFeeRates.high}
            onSelect={() => handleSelectFeeRate(suggestedFeeRates.high)}
          />
          <FeeOption
            label="Urgente"
            rate={suggestedFeeRates.urgent}
            selected={effectiveFeeRate === suggestedFeeRates.urgent}
            onSelect={() => handleSelectFeeRate(suggestedFeeRates.urgent)}
          />
        </View>

        {/* Custom Fee Rate */}
        <View style={styles.customFeeContainer}>
          <Text style={styles.label}>Personalizado (sat/vB):</Text>
          <TextInput
            style={styles.input}
            value={customFeeRate}
            onChangeText={handleCustomFeeRate}
            keyboardType="numeric"
            placeholder={`${MIN_FEE_RATE} - ${MAX_FEE_RATE}`}
            placeholderTextColor="#666"
          />
        </View>

        {/* Confirmation Estimate */}
        <Text style={styles.estimateText}>⏱️ {estimateConfirmationTime(effectiveFeeRate)}</Text>
      </View>

      {/* Fee Calculation Preview */}
      {state.feeCalculation && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cálculo de Fee</Text>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Fee Total (Parent + Child):</Text>
            <Text style={styles.value}>{formatFee(state.feeCalculation.totalFeeSat)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Fee da Child TX:</Text>
            <Text style={styles.value}>{formatFee(state.feeCalculation.childFeeSat)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Fee Rate Efetivo:</Text>
            <Text style={styles.value}>
              {state.feeCalculation.effectiveFeeRate.toFixed(2)} sat/vB
            </Text>
          </View>
        </View>
      )}

      {/* Destination & Key Inputs (only shown when ready to create) */}
      {canBump && state.status !== 'success' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuração</Text>

          <Text style={styles.inputLabel}>Endereço de Destino:</Text>
          <TextInput
            style={styles.inputFull}
            value={destinationAddress}
            onChangeText={setDestinationAddress}
            placeholder="bc1q..."
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.inputLabel}>Private Key (hex):</Text>
          <TextInput
            style={styles.inputFull}
            value={privateKey}
            onChangeText={setPrivateKey}
            placeholder="Chave privada em hexadecimal"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        </View>
      )}

      {/* Error Display */}
      {state.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>❌ {state.error}</Text>
        </View>
      )}

      {/* Success Display */}
      {state.status === 'success' && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✅ Transação CPFP enviada com sucesso!</Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        {state.status === 'idle' || state.status === 'calculating' ? (
          <TouchableOpacity
            style={[styles.button, styles.primaryButton, !canBump && styles.disabledButton]}
            onPress={handleCreateCpfp}
            disabled={!canBump || state.loading}
          >
            {state.loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Criar TX CPFP</Text>
            )}
          </TouchableOpacity>
        ) : state.status === 'ready' && state.cpfpTxHex ? (
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleBroadcast}
            disabled={state.loading}
          >
            {state.loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Enviar TX CPFP</Text>
            )}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={state.status === 'success' ? handleReset : onCancel}
        >
          <Text style={styles.secondaryButtonText}>
            {state.status === 'success' ? 'Nova Operação' : 'Cancelar'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

// ============================================================================
// Sub-componentes
// ============================================================================

interface FeeOptionProps {
  label: string
  rate: number
  selected: boolean
  onSelect: () => void
}

function FeeOption({ label, rate, selected, onSelect }: FeeOptionProps): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.feeOption, selected && styles.feeOptionSelected]}
      onPress={onSelect}
    >
      <Text style={[styles.feeOptionLabel, selected && styles.feeOptionLabelSelected]}>
        {label}
      </Text>
      <Text style={[styles.feeOptionRate, selected && styles.feeOptionRateSelected]}>
        {rate} sat/vB
      </Text>
    </TouchableOpacity>
  )
}

// ============================================================================
// Utilitários
// ============================================================================

function getTransactionTypeLabel(type: PendingTransaction['type']): string {
  const labels: Record<PendingTransaction['type'], string> = {
    commitment: 'Commitment TX',
    htlc_success: 'HTLC Success TX',
    htlc_timeout: 'HTLC Timeout TX',
    sweep: 'Sweep TX',
  }
  return labels[type]
}

// ============================================================================
// Estilos
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
  },
  section: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  label: {
    fontSize: 14,
    color: '#888888',
  },
  value: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  feeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  feeOption: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  feeOptionSelected: {
    borderColor: '#F7931A',
    backgroundColor: 'rgba(247, 147, 26, 0.1)',
  },
  feeOptionLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  feeOptionLabelSelected: {
    color: '#F7931A',
  },
  feeOptionRate: {
    fontSize: 12,
    color: '#888888',
  },
  feeOptionRateSelected: {
    color: '#F7931A',
  },
  customFeeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  inputFull: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 8,
  },
  estimateText: {
    fontSize: 14,
    color: '#4CAF50',
    marginTop: 12,
    textAlign: 'center',
  },
  warningBox: {
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  warningText: {
    fontSize: 14,
    color: '#FFC107',
  },
  errorBox: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
  },
  successBox: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  successText: {
    fontSize: 14,
    color: '#4CAF50',
  },
  actions: {
    gap: 12,
    marginTop: 8,
    marginBottom: 32,
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#F7931A',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#F7931A',
  },
  disabledButton: {
    backgroundColor: '#333333',
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F7931A',
  },
})

export default FeeBumping
