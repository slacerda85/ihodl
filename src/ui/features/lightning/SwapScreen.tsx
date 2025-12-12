/**
 * SwapScreen - Tela para Submarine Swaps
 *
 * Permite realizar swaps entre on-chain Bitcoin e Lightning:
 * - Loop In: On-chain BTC → Lightning
 * - Loop Out: Lightning → On-chain BTC
 *
 * Otimizado para React 19 e React Compiler.
 */

import { useState, useCallback, memo, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native'

import { useSubmarineSwap } from './hooks'
import { useLightningBalance } from '@/ui/features/app-provider'
import { SwapType } from '@/core/lib/lightning/submarineSwap'
import { formatSats } from './utils'
import SwapProgress from './SwapProgress'

// ==========================================
// TYPES
// ==========================================

interface SwapScreenProps {
  /** Tipo inicial de swap */
  initialType?: SwapType
  /** Callback quando swap é criado */
  onSwapCreated?: (swapId: string) => void
  /** Callback quando swap é completado */
  onSwapCompleted?: (swapId: string) => void
  /** Callback para erro */
  onError?: (error: string) => void
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

interface SwapTypeSelectorProps {
  selected: SwapType
  onSelect: (type: SwapType) => void
  disabled?: boolean
}

const SwapTypeSelector = memo(function SwapTypeSelector({
  selected,
  onSelect,
  disabled,
}: SwapTypeSelectorProps) {
  return (
    <View style={styles.typeSelector}>
      <TouchableOpacity
        style={[styles.typeButton, selected === SwapType.FORWARD && styles.typeButtonActive]}
        onPress={() => onSelect(SwapType.FORWARD)}
        disabled={disabled}
      >
        <Text style={styles.typeIcon}>⬇️</Text>
        <Text style={[styles.typeText, selected === SwapType.FORWARD && styles.typeTextActive]}>
          Loop In
        </Text>
        <Text style={styles.typeSubtext}>Chain → Lightning</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.typeButton, selected === SwapType.REVERSE && styles.typeButtonActive]}
        onPress={() => onSelect(SwapType.REVERSE)}
        disabled={disabled}
      >
        <Text style={styles.typeIcon}>⬆️</Text>
        <Text style={[styles.typeText, selected === SwapType.REVERSE && styles.typeTextActive]}>
          Loop Out
        </Text>
        <Text style={styles.typeSubtext}>Lightning → Chain</Text>
      </TouchableOpacity>
    </View>
  )
})

interface AmountInputProps {
  value: string
  onChange: (value: string) => void
  balance?: bigint
  disabled?: boolean
  label: string
  placeholder: string
}

const AmountInput = memo(function AmountInput({
  value,
  onChange,
  balance,
  disabled,
  label,
  placeholder,
}: AmountInputProps) {
  return (
    <View style={styles.inputGroup}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {balance !== undefined && (
          <Text style={styles.balance}>Disponível: {formatSats(balance)}</Text>
        )}
      </View>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        keyboardType="numeric"
        value={value}
        onChangeText={onChange}
        editable={!disabled}
      />
    </View>
  )
})

interface AddressInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  label: string
  placeholder: string
}

const AddressInput = memo(function AddressInput({
  value,
  onChange,
  disabled,
  label,
  placeholder,
}: AddressInputProps) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, styles.addressInput]}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  )
})

interface FeeDisplayProps {
  amount: bigint
  fee: bigint
  type: SwapType
}

const FeeDisplay = memo(function FeeDisplay({ amount, fee, type }: FeeDisplayProps) {
  const netAmount =
    type === SwapType.FORWARD
      ? amount // Recebe no Lightning
      : amount - fee // Recebe on-chain menos fee

  return (
    <View style={styles.feeContainer}>
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>Taxa do swap</Text>
        <Text style={styles.feeValue}>{formatSats(fee)}</Text>
      </View>
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>Você receberá</Text>
        <Text style={[styles.feeValue, styles.netAmount]}>
          {formatSats(netAmount > 0n ? netAmount : 0n)}
        </Text>
      </View>
    </View>
  )
})

interface ErrorBannerProps {
  message: string
  onDismiss?: () => void
}

const ErrorBanner = memo(function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss}>
          <Text style={styles.errorDismiss}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  )
})

// ==========================================
// MAIN COMPONENT
// ==========================================

function SwapScreen({
  initialType = SwapType.FORWARD,
  onSwapCreated,
  onSwapCompleted,
  onError,
}: SwapScreenProps) {
  const {
    state: swapState,
    isLoading,
    createLoopIn,
    createLoopOut,
    estimateFee,
    validateSwapParams,
  } = useSubmarineSwap()

  const balance = useLightningBalance()

  // Estados locais
  const [swapType, setSwapType] = useState<SwapType>(initialType)
  const [amountStr, setAmountStr] = useState('')
  const [address, setAddress] = useState('')
  const [invoice, setInvoice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activeSwapId, setActiveSwapId] = useState<string | null>(null)

  // Valores calculados
  const amount = useMemo(() => {
    const parsed = parseInt(amountStr, 10)
    return isNaN(parsed) ? 0n : BigInt(parsed)
  }, [amountStr])

  const estimatedFee = useMemo(() => {
    if (amount <= 0n) return 0n
    return estimateFee(amount, swapType)
  }, [amount, swapType, estimateFee])

  const validation = useMemo(() => {
    if (amount <= 0n) return { valid: false, errors: ['Digite um valor'] }
    return validateSwapParams(amount, swapType)
  }, [amount, swapType, validateSwapParams])

  // Verificar swap ativo
  const activeSwap = useMemo(() => {
    if (!activeSwapId) return null
    return swapState.activeSwaps.find(s => s.paymentHash === activeSwapId) || null
  }, [activeSwapId, swapState.activeSwaps])

  // Handlers
  const handleTypeChange = useCallback((type: SwapType) => {
    setSwapType(type)
    setError(null)
  }, [])

  const handleAmountChange = useCallback((value: string) => {
    // Apenas números
    const cleaned = value.replace(/[^0-9]/g, '')
    setAmountStr(cleaned)
    setError(null)
  }, [])

  const handleCreateSwap = useCallback(async () => {
    setError(null)

    if (!validation.valid) {
      const errorMsg = validation.errors.join(', ')
      setError(errorMsg)
      onError?.(errorMsg)
      return
    }

    try {
      if (swapType === SwapType.FORWARD) {
        // Loop In - requer invoice e endereço de refund
        if (!invoice) {
          setError('Invoice Lightning é obrigatório')
          return
        }
        if (!address) {
          setError('Endereço de refund é obrigatório')
          return
        }

        const result = await createLoopIn({
          amountSat: amount,
          invoice,
          refundAddress: address,
        })

        if (result.success && result.swap) {
          setActiveSwapId(result.swap.paymentHash)
          onSwapCreated?.(result.swap.paymentHash)
        } else {
          setError(result.error || 'Erro ao criar swap')
          onError?.(result.error || 'Erro ao criar swap')
        }
      } else {
        // Loop Out - requer endereço on-chain
        if (!address) {
          setError('Endereço Bitcoin é obrigatório')
          return
        }

        const result = await createLoopOut({
          amountSat: amount,
          onchainAddress: address,
        })

        if (result.success && result.swap) {
          setActiveSwapId(result.swap.paymentHash)
          onSwapCreated?.(result.swap.paymentHash)
        } else {
          setError(result.error || 'Erro ao criar swap')
          onError?.(result.error || 'Erro ao criar swap')
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      setError(message)
      onError?.(message)
    }
  }, [
    swapType,
    amount,
    address,
    invoice,
    validation,
    createLoopIn,
    createLoopOut,
    onSwapCreated,
    onError,
  ])

  const handleSwapComplete = useCallback(
    (swapId: string) => {
      setActiveSwapId(null)
      setAmountStr('')
      setAddress('')
      setInvoice('')
      onSwapCompleted?.(swapId)
    },
    [onSwapCompleted],
  )

  const dismissError = useCallback(() => {
    setError(null)
  }, [])

  // Se há swap ativo, mostrar progresso
  if (activeSwap) {
    return (
      <SwapProgress
        swap={activeSwap}
        onComplete={handleSwapComplete}
        onCancel={() => setActiveSwapId(null)}
      />
    )
  }

  const isDisabled = isLoading
  const canSubmit = validation.valid && !isLoading

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Submarine Swap</Text>

      {/* Seletor de tipo */}
      <SwapTypeSelector selected={swapType} onSelect={handleTypeChange} disabled={isDisabled} />

      {/* Input de valor */}
      <AmountInput
        value={amountStr}
        onChange={handleAmountChange}
        balance={swapType === SwapType.REVERSE ? balance?.totalSendable : undefined}
        disabled={isDisabled}
        label="Valor (sats)"
        placeholder="Ex: 100000"
      />

      {/* Inputs específicos por tipo */}
      {swapType === SwapType.FORWARD ? (
        <>
          <AddressInput
            value={invoice}
            onChange={setInvoice}
            disabled={isDisabled}
            label="Invoice Lightning"
            placeholder="lnbc..."
          />
          <AddressInput
            value={address}
            onChange={setAddress}
            disabled={isDisabled}
            label="Endereço de Refund (Bitcoin)"
            placeholder="bc1q..."
          />
        </>
      ) : (
        <AddressInput
          value={address}
          onChange={setAddress}
          disabled={isDisabled}
          label="Endereço Bitcoin"
          placeholder="bc1q..."
        />
      )}

      {/* Display de fees */}
      {amount > 0n && <FeeDisplay amount={amount} fee={estimatedFee} type={swapType} />}

      {/* Erros de validação */}
      {!validation.valid && amount > 0n && (
        <View style={styles.validationErrors}>
          {validation.errors.map((err, i) => (
            <Text key={i} style={styles.validationError}>
              ⚠️ {err}
            </Text>
          ))}
        </View>
      )}

      {/* Banner de erro */}
      {error && <ErrorBanner message={error} onDismiss={dismissError} />}

      {/* Botão de criar swap */}
      <TouchableOpacity
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleCreateSwap}
        disabled={!canSubmit}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {swapType === SwapType.FORWARD ? 'Iniciar Loop In' : 'Iniciar Loop Out'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Info sobre limites */}
      {swapState.limits && (
        <View style={styles.limitsInfo}>
          <Text style={styles.limitsTitle}>Limites</Text>
          <Text style={styles.limitsText}>Mínimo: {formatSats(swapState.limits.minAmount)}</Text>
          <Text style={styles.limitsText}>
            Máximo:{' '}
            {formatSats(
              swapType === SwapType.FORWARD
                ? swapState.limits.maxLoopIn
                : swapState.limits.maxLoopOut,
            )}
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

export default memo(SwapScreen)

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#333',
    textAlign: 'center',
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  typeButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  typeButtonActive: {
    borderColor: '#F7931A',
    backgroundColor: '#FFF8F0',
  },
  typeIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  typeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  typeTextActive: {
    color: '#F7931A',
  },
  typeSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  balance: {
    fontSize: 12,
    color: '#999',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  addressInput: {
    fontFamily: 'monospace',
    fontSize: 14,
  },
  feeContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  feeLabel: {
    fontSize: 14,
    color: '#666',
  },
  feeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  netAmount: {
    color: '#2ecc71',
    fontSize: 16,
  },
  validationErrors: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  validationError: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#c00',
  },
  errorDismiss: {
    fontSize: 18,
    color: '#c00',
    paddingLeft: 12,
  },
  button: {
    backgroundColor: '#F7931A',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  limitsInfo: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  limitsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  limitsText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
})
