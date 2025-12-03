// Exemplo de componente para gerar e exibir Lightning invoices
// Demonstra o uso do hook useLightning

import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useLightning } from './useLightning'
import type { InvoiceWithChannelInfo } from '@/core/models/lightning/client'

interface LightningInvoiceGeneratorProps {
  masterKey: Uint8Array
  network?: 'mainnet' | 'testnet' | 'regtest'
}

export default function LightningInvoiceGenerator({
  masterKey,
  network = 'testnet',
}: LightningInvoiceGeneratorProps) {
  const { generateInvoice, isLoading, error } = useLightning()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [invoice, setInvoice] = useState<InvoiceWithChannelInfo | null>(null)

  const handleGenerateInvoice = async () => {
    try {
      // Converter amount para millisatoshis (se fornecido)
      const amountMsat = amount ? BigInt(amount) * 1000n : undefined

      const result = await generateInvoice(
        {
          amount: amountMsat,
          description: description || 'Lightning payment',
          expiry: 3600, // 1 hora
        },
        masterKey,
        network,
      )

      setInvoice(result)
    } catch (err) {
      console.error('Failed to generate invoice:', err)
    }
  }

  const formatSats = (msat?: bigint): string => {
    if (!msat) return 'Any amount'
    return `${Number(msat / 1000n)} sats`
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Generate Lightning Invoice</Text>

      {/* Amount input */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Amount (sats)</Text>
        <TextInput
          style={styles.input}
          placeholder="Leave empty for donation invoice"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
          editable={!isLoading}
        />
      </View>

      {/* Description input */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          placeholder="What is this payment for?"
          value={description}
          onChangeText={setDescription}
          editable={!isLoading}
        />
      </View>

      {/* Generate button */}
      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleGenerateInvoice}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Generate Invoice</Text>
        )}
      </TouchableOpacity>

      {/* Error display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      )}

      {/* Invoice display */}
      {invoice && (
        <View style={styles.invoiceContainer}>
          <Text style={styles.invoiceTitle}>Invoice Generated!</Text>

          {/* Amount */}
          <View style={styles.invoiceRow}>
            <Text style={styles.invoiceLabel}>Amount:</Text>
            <Text style={styles.invoiceValue}>{formatSats(invoice.amount)}</Text>
          </View>

          {/* Channel opening fee warning */}
          {invoice.requiresChannel && invoice.channelOpeningFee && (
            <View style={styles.warningContainer}>
              <Text style={styles.warningText}>
                ⚠️ First payment - Channel opening fee:{' '}
                {formatSats(invoice.channelOpeningFee * 1000n)}
              </Text>
              <Text style={styles.warningSubtext}>
                This fee is charged only once to open your first Lightning channel. Future payments
                will have minimal fees.
              </Text>
            </View>
          )}

          {/* Invoice string (for QR code) */}
          <View style={styles.invoiceRow}>
            <Text style={styles.invoiceLabel}>Invoice:</Text>
          </View>
          <View style={styles.qrCodePlaceholder}>
            <Text style={styles.qrCodeText}>QR Code Here</Text>
            <Text style={styles.invoiceString} numberOfLines={3}>
              {invoice.qrCode}
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
      )}
    </View>
  )
}

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
