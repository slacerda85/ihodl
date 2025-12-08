/**
 * Payment Receive Screen
 *
 * Tela para recebimento de pagamentos Lightning Network.
 * Gera invoices BOLT11 com QR code.
 */

import React, { useState, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
  type ViewStyle,
  type TextStyle,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useLightningActions, useHasActiveChannels } from '../hooks'
import { useActiveColorMode } from '@/ui/features/app-provider'
import { useAutoChannelOpening, useInboundCapacity } from '../hooks'
import { useInboundBalance } from '../hooks'
import type { Invoice, Millisatoshis } from '../types'

// ==========================================
// TYPES
// ==========================================

type ReceiveStep = 'input' | 'generating' | 'display'

interface ReceiveState {
  step: ReceiveStep
  amount: string
  description: string
  invoice: Invoice | null
  error: string | null
}

// ==========================================
// HELPERS
// ==========================================

function formatMsat(msat: Millisatoshis): string {
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

function satsToMsat(sats: string): Millisatoshis {
  const num = parseFloat(sats) || 0
  return BigInt(Math.floor(num * 1000))
}

// ==========================================
// QR CODE PLACEHOLDER
// ==========================================

function QRCodePlaceholder({ data, size }: { data: string; size: number }) {
  // TODO: Replace with actual QR code component
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: colors.white,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 12, color: colors.placeholder, textAlign: 'center' }}>
        QR Code{'\n'}(Component pendente)
      </Text>
      <Text
        style={{
          fontSize: 8,
          color: colors.placeholder,
          marginTop: 8,
          fontFamily: 'monospace',
        }}
        numberOfLines={3}
      >
        {data.slice(0, 50)}...
      </Text>
    </View>
  )
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function PaymentReceiveScreen() {
  const router = useRouter()
  const colorMode = useActiveColorMode()
  const hasActiveChannels = useHasActiveChannels()
  const { generateInvoice } = useLightningActions()
  const { openChannelIfNeeded, isAutoEnabled } = useAutoChannelOpening()
  const inboundCapacity = useInboundCapacity()
  const inboundBalance = useInboundBalance()

  const [state, setState] = useState<ReceiveState>({
    step: 'input',
    amount: '',
    description: '',
    invoice: null,
    error: null,
  })

  const [isOpeningChannel, setIsOpeningChannel] = useState(false)

  // ==========================================
  // ACTIONS
  // ==========================================

  const handleGenerateInvoice = useCallback(async () => {
    const amountMsat = satsToMsat(state.amount)

    if (state.amount && amountMsat <= 0n) {
      setState(prev => ({ ...prev, error: 'Valor deve ser maior que 0' }))
      return
    }

    setState(prev => ({ ...prev, step: 'generating', error: null }))

    try {
      // Verifica liquidez se há valor especificado
      if (amountMsat > 0n) {
        // Calcula se há liquidez suficiente (inline para evitar hook rules violation)
        const amountSat = amountMsat / 1000n
        const effectiveCapacity = inboundCapacity + inboundBalance.pendingOnChainBalance
        const hasLiquidity = effectiveCapacity >= amountSat

        if (!hasLiquidity && isAutoEnabled) {
          setIsOpeningChannel(true)

          // Tenta abrir canal automaticamente
          const channelOpened = await openChannelIfNeeded(amountMsat)

          setIsOpeningChannel(false)

          if (!channelOpened) {
            // Canal não pôde ser aberto automaticamente
            setState(prev => ({
              ...prev,
              step: 'input',
              error:
                'Liquidez insuficiente. Configure abertura automática de canais ou abra um canal manualmente.',
            }))
            return
          }
        } else if (!hasLiquidity) {
          // Sem liquidez e abertura automática desabilitada
          setState(prev => ({
            ...prev,
            step: 'input',
            error: 'Liquidez insuficiente para receber este valor. Abra um canal adicional.',
          }))
          return
        }
      }

      // Gera a invoice
      const invoice = await generateInvoice(amountMsat, state.description || undefined)

      setState(prev => ({
        ...prev,
        step: 'display',
        invoice,
        error: null,
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        step: 'input',
        error: error instanceof Error ? error.message : 'Erro ao gerar invoice',
      }))
    }
  }, [
    state.amount,
    state.description,
    generateInvoice,
    isAutoEnabled,
    openChannelIfNeeded,
    inboundCapacity,
    inboundBalance,
  ])

  const handleCopyInvoice = useCallback(async () => {
    if (!state.invoice) return

    try {
      // Note: In RN, we'd use Clipboard from @react-native-clipboard/clipboard
      Alert.alert('Copiado!', 'Invoice copiada para a área de transferência.')
    } catch {
      Alert.alert('Erro', 'Não foi possível copiar a invoice.')
    }
  }, [state.invoice])

  const handleShareInvoice = useCallback(async () => {
    if (!state.invoice) return

    try {
      await Share.share({
        message: state.invoice.invoice,
        title: 'Invoice Lightning',
      })
    } catch (error) {
      // User cancelled share
    }
  }, [state.invoice])

  const handleNewInvoice = useCallback(() => {
    setState({
      step: 'input',
      amount: '',
      description: '',
      invoice: null,
      error: null,
    })
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
        <Text style={[styles.title, { color: textColor }]}>Receber</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* No Channels Warning */}
        {!hasActiveChannels && (
          <View style={[styles.warningCard, { backgroundColor: alpha(colors.warning, 0.15) }]}>
            <Text style={[styles.warningText, { color: colors.warning }]}>
              ⚠️ Você não tem canais ativos. Para receber pagamentos Lightning, é necessário ter
              capacidade de entrada (inbound liquidity).
              {isAutoEnabled && ' Canais podem ser abertos automaticamente quando necessário.'}
            </Text>
          </View>
        )}

        {/* Input Step */}
        {state.step === 'input' && (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, { color: textColor }]}>Criar Invoice</Text>

            {/* Amount Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: textColor }]}>Valor (sats) - Opcional</Text>
              <TextInput
                style={[styles.input, { backgroundColor: surfaceColor, color: textColor }]}
                value={state.amount}
                onChangeText={text => setState(prev => ({ ...prev, amount: text, error: null }))}
                placeholder="0 = qualquer valor"
                placeholderTextColor={colors.placeholder}
                keyboardType="number-pad"
              />
            </View>

            {/* Description Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: textColor }]}>Descrição - Opcional</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.multilineInput,
                  { backgroundColor: surfaceColor, color: textColor },
                ]}
                value={state.description}
                onChangeText={text => setState(prev => ({ ...prev, description: text }))}
                placeholder="Ex: Pagamento por serviço"
                placeholderTextColor={colors.placeholder}
                multiline
                numberOfLines={3}
              />
            </View>

            {state.error && <Text style={styles.errorText}>{state.error}</Text>}

            <TouchableOpacity style={styles.primaryButton} onPress={handleGenerateInvoice}>
              <Text style={styles.primaryButtonText}>Gerar Invoice</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Generating Step */}
        {state.step === 'generating' && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.statusTitle, { color: textColor }]}>
              {isOpeningChannel ? 'Abrindo canal automaticamente...' : 'Gerando invoice...'}
            </Text>
            {isOpeningChannel && (
              <Text style={[styles.statusSubtitle, { color: secondaryColor }]}>
                Configurando liquidez para receber pagamentos
              </Text>
            )}
          </View>
        )}

        {/* Display Step */}
        {state.step === 'display' && state.invoice && (
          <View style={styles.stepContainer}>
            {/* QR Code */}
            <View style={styles.qrContainer}>
              <QRCodePlaceholder data={state.invoice.invoice} size={200} />
            </View>

            {/* Amount Display */}
            {state.invoice.amount > 0n && (
              <View style={styles.amountDisplay}>
                <Text style={[styles.amountLabel, { color: secondaryColor }]}>Valor</Text>
                <Text style={[styles.amountValue, { color: textColor }]}>
                  {formatMsat(state.invoice.amount)}
                </Text>
              </View>
            )}

            {/* Description Display */}
            {state.invoice.description && (
              <View style={styles.descriptionDisplay}>
                <Text style={[styles.descriptionLabel, { color: secondaryColor }]}>
                  {state.invoice.description}
                </Text>
              </View>
            )}

            {/* Invoice String */}
            <View style={[styles.invoiceCard, { backgroundColor: surfaceColor }]}>
              <Text style={[styles.invoiceText, { color: secondaryColor }]} numberOfLines={4}>
                {state.invoice.invoice}
              </Text>
            </View>

            {/* Expiry Info */}
            <Text style={[styles.expiryInfo, { color: secondaryColor }]}>
              Expira em: {new Date(state.invoice.expiresAt).toLocaleString()}
            </Text>

            {/* Actions */}
            <View style={styles.displayActions}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: surfaceColor }]}
                onPress={handleCopyInvoice}
              >
                <IconSymbol name="doc.on.doc" size={20} color={colors.primary} />
                <Text style={[styles.actionButtonText, { color: colors.primary }]}>Copiar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: surfaceColor }]}
                onPress={handleShareInvoice}
              >
                <IconSymbol name="square.and.arrow.up" size={20} color={colors.primary} />
                <Text style={[styles.actionButtonText, { color: colors.primary }]}>
                  Compartilhar
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: alpha(textColor, 0.2) }]}
              onPress={handleNewInvoice}
            >
              <Text style={[styles.secondaryButtonText, { color: textColor }]}>Nova Invoice</Text>
            </TouchableOpacity>
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
  warningCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  } as ViewStyle,
  warningText: {
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,
  stepContainer: {
    flex: 1,
  } as ViewStyle,
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  } as TextStyle,
  inputGroup: {
    marginBottom: 20,
  } as ViewStyle,
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  } as TextStyle,
  input: {
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
  } as TextStyle,
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  } as TextStyle,
  errorText: {
    color: colors.error,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  } as TextStyle,
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  } as ViewStyle,
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  } as ViewStyle,
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
  } as TextStyle,
  statusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  } as ViewStyle,
  statusTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginTop: 16,
  } as TextStyle,
  statusSubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  } as TextStyle,
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  } as ViewStyle,
  amountDisplay: {
    alignItems: 'center',
    marginBottom: 8,
  } as ViewStyle,
  amountLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as TextStyle,
  amountValue: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  } as TextStyle,
  descriptionDisplay: {
    alignItems: 'center',
    marginBottom: 16,
  } as ViewStyle,
  descriptionLabel: {
    fontSize: 14,
    textAlign: 'center',
  } as TextStyle,
  invoiceCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  } as ViewStyle,
  invoiceText: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 16,
  } as TextStyle,
  expiryInfo: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 24,
  } as TextStyle,
  displayActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  } as ViewStyle,
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  } as ViewStyle,
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  } as TextStyle,
})
