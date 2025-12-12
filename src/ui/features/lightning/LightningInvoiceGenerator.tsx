/**
 * LightningInvoiceGenerator
 *
 * Componente para gerar e exibir Lightning invoices.
 * Otimizado para React 19 e React Compiler.
 */

import { useState, useCallback, memo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'

import { useLightningState, useLightningActions } from '@/ui/features/app-provider'
import { formatMsat, satToMsat } from './utils'
import type { Invoice } from './types'

// ==========================================
// TYPES
// ==========================================

interface LightningInvoiceGeneratorProps {
  /** Callback chamado quando invoice é gerada com sucesso */
  onInvoiceGenerated?: (invoice: Invoice) => void
  /** Callback chamado em caso de erro */
  onError?: (error: Error) => void
}

// ==========================================
// SUB-COMPONENTS (extraídos para evitar re-criação)
// ==========================================

interface InputGroupProps {
  label: string
  placeholder: string
  value: string
  onChangeText: (text: string) => void
  disabled?: boolean
  keyboardType?: 'default' | 'numeric'
}

const InputGroup = memo(function InputGroup({
  label,
  placeholder,
  value,
  onChangeText,
  disabled,
  keyboardType = 'default',
}: InputGroupProps) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
      />
    </View>
  )
})

interface ErrorDisplayProps {
  message: string
}

const ErrorDisplay = memo(function ErrorDisplay({ message }: ErrorDisplayProps) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  )
})

interface ChannelFeeWarningProps {
  fee: bigint
}

const ChannelFeeWarning = memo(function ChannelFeeWarning({ fee }: ChannelFeeWarningProps) {
  return (
    <View style={styles.warningContainer}>
      <Text style={styles.warningText}>
        ⚠️ First payment - Channel opening fee: {formatMsat(fee * 1000n)}
      </Text>
      <Text style={styles.warningSubtext}>
        This fee is charged only once to open your first Lightning channel. Future payments will
        have minimal fees.
      </Text>
    </View>
  )
})

interface InvoiceDisplayProps {
  invoice: Invoice
}

const InvoiceDisplay = memo(function InvoiceDisplay({ invoice }: InvoiceDisplayProps) {
  return (
    <View style={styles.invoiceContainer}>
      <Text style={styles.invoiceTitle}>Invoice Generated!</Text>

      {/* Amount */}
      <View style={styles.invoiceRow}>
        <Text style={styles.invoiceLabel}>Amount:</Text>
        <Text style={styles.invoiceValue}>
          {invoice.amount ? formatMsat(invoice.amount) : 'Any amount'}
        </Text>
      </View>

      {/* Channel opening fee warning */}
      {invoice.requiresChannelOpening && invoice.channelOpeningFee && (
        <ChannelFeeWarning fee={invoice.channelOpeningFee} />
      )}

      {/* Invoice string (for QR code) */}
      <View style={styles.invoiceRow}>
        <Text style={styles.invoiceLabel}>Invoice:</Text>
      </View>
      <View style={styles.qrCodePlaceholder}>
        <Text style={styles.qrCodeText}>QR Code Here</Text>
        <Text style={styles.invoiceString} numberOfLines={3}>
          {invoice.invoice}
        </Text>
      </View>

      {/* Payment hash */}
      <View style={styles.invoiceRow}>
        <Text style={styles.invoiceLabel}>Payment Hash:</Text>
        <Text style={styles.invoiceValue} numberOfLines={1}>
          {invoice.paymentHash.substring(0, 16)}...
        </Text>
      </View>
    </View>
  )
})

// ==========================================
// MAIN COMPONENT
// ==========================================

function LightningInvoiceGenerator({
  onInvoiceGenerated,
  onError,
}: LightningInvoiceGeneratorProps) {
  const state = useLightningState()
  const { generateInvoice } = useLightningActions()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerateInvoice = useCallback(async () => {
    setError(null)
    setIsGenerating(true)

    try {
      // Converter amount para millisatoshis (se fornecido)
      const amountMsat = amount ? satToMsat(BigInt(amount)) : 0n

      const result = await generateInvoice(amountMsat, description || 'Lightning payment')

      setInvoice(result)
      onInvoiceGenerated?.(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate invoice'
      setError(errorMessage)
      onError?.(err instanceof Error ? err : new Error(errorMessage))
    } finally {
      setIsGenerating(false)
    }
  }, [amount, description, generateInvoice, onInvoiceGenerated, onError])

  const isLoading = isGenerating || state.isLoading
  const isDisabled = isLoading || !state.isInitialized

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Generate Lightning Invoice</Text>

      {!state.isInitialized && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>⚠️ Lightning not initialized</Text>
        </View>
      )}

      <InputGroup
        label="Amount (sats)"
        placeholder="Leave empty for donation invoice"
        value={amount}
        onChangeText={setAmount}
        disabled={isDisabled}
        keyboardType="numeric"
      />

      <InputGroup
        label="Description"
        placeholder="What is this payment for?"
        value={description}
        onChangeText={setDescription}
        disabled={isDisabled}
      />

      <TouchableOpacity
        style={[styles.button, isDisabled && styles.buttonDisabled]}
        onPress={handleGenerateInvoice}
        disabled={isDisabled}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Generate Invoice</Text>
        )}
      </TouchableOpacity>

      {error && <ErrorDisplay message={error} />}

      {invoice && <InvoiceDisplay invoice={invoice} />}
    </View>
  )
}

// Exportar como memo para evitar re-renders desnecessários
export default memo(LightningInvoiceGenerator)

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#333',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
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
  errorContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fee',
    borderRadius: 8,
  },
  errorText: {
    color: '#c00',
    fontSize: 14,
  },
  invoiceContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  invoiceRow: {
    marginBottom: 12,
  },
  invoiceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  invoiceValue: {
    fontSize: 16,
    color: '#333',
  },
  warningContainer: {
    marginVertical: 12,
    padding: 12,
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
  qrCodePlaceholder: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  qrCodeText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  invoiceString: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
})
