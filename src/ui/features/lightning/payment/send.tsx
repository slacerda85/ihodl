/**
 * Payment Send Screen
 *
 * Tela para envio de pagamentos Lightning Network.
 * Suporta input de invoice BOLT11 e envio com MPP automático.
 */

import React, { useState, useCallback, useEffect } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useLightningActions, useLightningBalance } from '@/ui/features/app-provider'
import { useActiveColorMode } from '@/ui/features/app-provider'
import type { DecodedInvoice } from '../types'

// ==========================================
// TYPES
// ==========================================

type PaymentStep = 'input' | 'confirm' | 'sending' | 'success' | 'error'

interface PaymentState {
  step: PaymentStep
  invoice: string
  decodedInvoice: DecodedInvoice | null
  maxFee: string
  error: string | null
  paymentHash: string | null
}

// ==========================================
// HELPERS
// ==========================================

function formatMsat(msat: bigint): string {
  const sats = Number(msat) / 1000
  if (sats >= 100000000) {
    return `${(sats / 100000000).toFixed(8)} BTC`
  } else if (sats >= 1000000) {
    return `${(sats / 1000000).toFixed(2)} M sats`
  } else if (sats >= 1000) {
    return `${(sats / 1000).toFixed(1)} K sats`
  }
  return `${sats.toFixed(0)} sats`
}

function isValidBolt11(invoice: string): boolean {
  const normalized = invoice.toLowerCase().trim()
  return (
    normalized.startsWith('lnbc') ||
    normalized.startsWith('lntb') ||
    normalized.startsWith('lnbcrt')
  )
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function PaymentSendScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ invoice?: string }>()
  const colorMode = useActiveColorMode()
  const balance = useLightningBalance()
  const { decodeInvoice, sendPayment } = useLightningActions()

  const [state, setState] = useState<PaymentState>({
    step: 'input',
    invoice: params.invoice || '',
    decodedInvoice: null,
    maxFee: '',
    error: null,
    paymentHash: null,
  })

  const [isDecoding, setIsDecoding] = useState(false)

  const handleDecodeInvoice = useCallback(
    async (invoiceStr?: string) => {
      const invoice = (invoiceStr || state.invoice).trim()
      if (!invoice) {
        setState(prev => ({ ...prev, error: 'Digite ou escaneie uma invoice' }))
        return
      }

      if (!isValidBolt11(invoice)) {
        setState(prev => ({
          ...prev,
          error: 'Invoice inválida. Deve começar com lnbc, lntb ou lnbcrt',
        }))
        return
      }

      setIsDecoding(true)
      setState(prev => ({ ...prev, error: null }))

      try {
        const decoded = await decodeInvoice(invoice)

        if (decoded.isExpired) {
          setState(prev => ({ ...prev, error: 'Esta invoice expirou' }))
          return
        }

        setState(prev => ({
          ...prev,
          invoice,
          decodedInvoice: decoded,
          step: 'confirm',
          error: null,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro ao decodificar invoice',
        }))
      } finally {
        setIsDecoding(false)
      }
    },
    [state.invoice, decodeInvoice],
  )

  // ==========================================
  // EFFECTS
  // ==========================================

  // Auto-decode if invoice passed via params
  useEffect(() => {
    if (params.invoice && isValidBolt11(params.invoice)) {
      handleDecodeInvoice(params.invoice)
    }
  }, [params.invoice, handleDecodeInvoice])

  const handleSendPayment = useCallback(async () => {
    if (!state.decodedInvoice) return

    // Check balance
    if (state.decodedInvoice.amount > balance) {
      Alert.alert('Saldo insuficiente', 'Você não tem saldo suficiente para este pagamento.')
      return
    }

    setState(prev => ({ ...prev, step: 'sending', error: null }))

    try {
      const maxFee = state.maxFee ? BigInt(parseInt(state.maxFee) * 1000) : undefined
      const payment = await sendPayment(state.invoice, maxFee)

      if (payment.status === 'succeeded') {
        setState(prev => ({
          ...prev,
          step: 'success',
          paymentHash: payment.paymentHash,
        }))
      } else {
        setState(prev => ({
          ...prev,
          step: 'error',
          error: payment.error || 'Pagamento falhou',
        }))
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        step: 'error',
        error: error instanceof Error ? error.message : 'Erro ao enviar pagamento',
      }))
    }
  }, [state.invoice, state.decodedInvoice, state.maxFee, balance, sendPayment])

  const handleReset = useCallback(() => {
    setState({
      step: 'input',
      invoice: '',
      decodedInvoice: null,
      maxFee: '',
      error: null,
      paymentHash: null,
    })
  }, [])

  const handleScanQR = useCallback(() => {
    // TODO: Navigate to QR scanner
    Alert.alert('Em desenvolvimento', 'Scanner QR será implementado em breve.')
  }, [])

  // ==========================================
  // RENDER
  // ==========================================

  const textColor = colors.text[colorMode]
  const secondaryColor = alpha(textColor, 0.6)
  const bgColor = colors.background[colorMode]
  const surfaceColor = colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: textColor }]}>Enviar</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Input Step */}
        {state.step === 'input' && (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, { color: textColor }]}>
              Digite ou escaneie a invoice
            </Text>

            <View style={[styles.inputContainer, { backgroundColor: surfaceColor }]}>
              <TextInput
                style={[styles.invoiceInput, { color: textColor }]}
                value={state.invoice}
                onChangeText={text => setState(prev => ({ ...prev, invoice: text, error: null }))}
                placeholder="lnbc..."
                placeholderTextColor={colors.placeholder}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {state.error && <Text style={styles.errorText}>{state.error}</Text>}

            <View style={styles.inputActions}>
              <TouchableOpacity
                style={[styles.scanButton, { borderColor: colors.primary }]}
                onPress={handleScanQR}
              >
                <IconSymbol name="qrcode" size={20} color={colors.primary} />
                <Text style={[styles.scanButtonText, { color: colors.primary }]}>Escanear QR</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!state.invoice || isDecoding) && styles.buttonDisabled,
              ]}
              onPress={() => handleDecodeInvoice()}
              disabled={!state.invoice || isDecoding}
            >
              {isDecoding ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Continuar</Text>
              )}
            </TouchableOpacity>

            {/* Balance Display */}
            <View style={styles.balanceInfo}>
              <Text style={[styles.balanceLabel, { color: secondaryColor }]}>
                Saldo disponível:
              </Text>
              <Text style={[styles.balanceValue, { color: textColor }]}>{formatMsat(balance)}</Text>
            </View>
          </View>
        )}

        {/* Confirm Step */}
        {state.step === 'confirm' && state.decodedInvoice && (
          <View style={styles.stepContainer}>
            <View style={[styles.confirmCard, { backgroundColor: surfaceColor }]}>
              <Text style={[styles.confirmLabel, { color: secondaryColor }]}>Valor</Text>
              <Text style={[styles.confirmAmount, { color: textColor }]}>
                {formatMsat(state.decodedInvoice.amount)}
              </Text>

              {state.decodedInvoice.description && (
                <>
                  <Text style={[styles.confirmLabel, { color: secondaryColor, marginTop: 16 }]}>
                    Descrição
                  </Text>
                  <Text style={[styles.confirmDescription, { color: textColor }]}>
                    {state.decodedInvoice.description}
                  </Text>
                </>
              )}

              <Text style={[styles.confirmLabel, { color: secondaryColor, marginTop: 16 }]}>
                Payment Hash
              </Text>
              <Text style={[styles.confirmHash, { color: secondaryColor }]}>
                {state.decodedInvoice.paymentHash.slice(0, 16)}...
              </Text>
            </View>

            {/* Max Fee Input */}
            <View style={styles.feeSection}>
              <Text style={[styles.feeLabel, { color: textColor }]}>
                Taxa máxima (sats) - Opcional
              </Text>
              <TextInput
                style={[styles.feeInput, { backgroundColor: surfaceColor, color: textColor }]}
                value={state.maxFee}
                onChangeText={text => setState(prev => ({ ...prev, maxFee: text }))}
                placeholder="Automático"
                placeholderTextColor={colors.placeholder}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: alpha(textColor, 0.2) }]}
                onPress={handleReset}
              >
                <Text style={[styles.secondaryButtonText, { color: textColor }]}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSendPayment}>
                <Text style={styles.primaryButtonText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Sending Step */}
        {state.step === 'sending' && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.statusTitle, { color: textColor }]}>Enviando pagamento...</Text>
            <Text style={[styles.statusDescription, { color: secondaryColor }]}>
              Buscando rota e enviando HTLCs
            </Text>
          </View>
        )}

        {/* Success Step */}
        {state.step === 'success' && (
          <View style={styles.statusContainer}>
            <View style={styles.successIcon}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
            <Text style={[styles.statusTitle, { color: textColor }]}>Pagamento enviado!</Text>
            <Text style={[styles.statusDescription, { color: secondaryColor }]}>
              {formatMsat(state.decodedInvoice?.amount || 0n)}
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
              <Text style={styles.primaryButtonText}>Concluir</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Error Step */}
        {state.step === 'error' && (
          <View style={styles.statusContainer}>
            <View style={styles.errorIcon}>
              <Text style={styles.errorIconText}>✕</Text>
            </View>
            <Text style={[styles.statusTitle, { color: textColor }]}>Pagamento falhou</Text>
            <Text style={[styles.statusDescription, { color: colors.error }]}>{state.error}</Text>
            <View style={styles.errorActions}>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: alpha(textColor, 0.2) }]}
                onPress={() => router.back()}
              >
                <Text style={[styles.secondaryButtonText, { color: textColor }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSendPayment}>
                <Text style={styles.primaryButtonText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  } as ViewStyle,
  backButton: {
    padding: 8,
  } as ViewStyle,
  title: {
    fontSize: 20,
    fontWeight: '600',
  } as TextStyle,
  placeholder: {
    width: 40,
  } as ViewStyle,
  content: {
    flex: 1,
  } as ViewStyle,
  contentContainer: {
    padding: 16,
    flexGrow: 1,
  } as ViewStyle,
  stepContainer: {
    flex: 1,
  } as ViewStyle,
  stepTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 16,
    textAlign: 'center',
  } as TextStyle,
  inputContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    minHeight: 120,
  } as ViewStyle,
  invoiceInput: {
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 20,
  } as TextStyle,
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  } as TextStyle,
  inputActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  } as ViewStyle,
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  } as ViewStyle,
  scanButtonText: {
    fontSize: 14,
    fontWeight: '500',
  } as TextStyle,
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  } as ViewStyle,
  buttonDisabled: {
    opacity: 0.5,
  } as ViewStyle,
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 12,
  } as ViewStyle,
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
  } as TextStyle,
  balanceInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  balanceLabel: {
    fontSize: 14,
  } as TextStyle,
  balanceValue: {
    fontSize: 14,
    fontWeight: '600',
  } as TextStyle,
  confirmCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  } as ViewStyle,
  confirmLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as TextStyle,
  confirmAmount: {
    fontSize: 32,
    fontWeight: '700',
    marginTop: 4,
  } as TextStyle,
  confirmDescription: {
    fontSize: 16,
    marginTop: 4,
  } as TextStyle,
  confirmHash: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 4,
  } as TextStyle,
  feeSection: {
    marginBottom: 24,
  } as ViewStyle,
  feeLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  } as TextStyle,
  feeInput: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  } as TextStyle,
  confirmActions: {
    flexDirection: 'row',
  } as ViewStyle,
  statusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  } as ViewStyle,
  statusTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  } as TextStyle,
  statusDescription: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  } as TextStyle,
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  successIconText: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '700',
  } as TextStyle,
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  errorIconText: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '700',
  } as TextStyle,
  errorActions: {
    flexDirection: 'row',
    width: '100%',
  } as ViewStyle,
})
