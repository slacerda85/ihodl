import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
  TextInput,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'

import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import QRCode from '@/ui/components/QRCode'
import Button from '@/ui/components/Button'
import { useSettings } from '@/ui/features/settings'
import { useLightning, Invoice } from '@/ui/features/lightning/LightningProvider'

// Componente de aviso de taxa on-chain esperada
interface OnChainFeeWarningProps {
  isDark: boolean
  estimatedFee?: bigint
}

function OnChainFeeWarning({ isDark, estimatedFee }: OnChainFeeWarningProps) {
  return (
    <View style={[styles.feeWarningContainer, isDark && styles.feeWarningContainerDark]}>
      <IconSymbol name="info.circle.fill" size={20} color={colors.info} />
      <View style={styles.feeWarningTextContainer}>
        <Text style={[styles.feeWarningTitle, isDark && styles.feeWarningTitleDark]}>
          On-chain fee expected
        </Text>
        <Text style={[styles.feeWarningMessage, isDark && styles.feeWarningMessageDark]}>
          {estimatedFee
            ? `A channel opening fee of ~${estimatedFee.toString()} sats will be deducted from your payment.`
            : 'An on-chain operation will be required to receive this payment. A fee will be deducted from the received amount.'}
        </Text>
      </View>
    </View>
  )
}

// Constante para conversão sat -> msat (fora do componente para o React Compiler)
const MSAT_PER_SAT = 1000n

export default function ReceiveLightning() {
  const { isDark } = useSettings()
  const { generateInvoice, state } = useLightning()

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [invoiceData, setInvoiceData] = useState<Invoice | null>(null)

  // Converter satoshis para millisatoshis (1 sat = 1000 msat)
  const amountValue = amount ? BigInt(amount) : 0n
  const amountMsat = amountValue * MSAT_PER_SAT
  const descriptionValue = description || 'Payment'

  // Gerar invoice automaticamente ao inicializar (invoice sem valor)
  useEffect(() => {
    const generate = async () => {
      // Verificar se está inicializado
      if (!state.isInitialized) return

      // Procurar invoice pendente existente com mesmo amount e description
      const existingInvoice = state.invoices.find(inv => {
        const now = Date.now()
        const isNotExpired = inv.expiresAt > now
        const isPending = inv.status === 'pending'
        const sameAmount = inv.amount === amountMsat
        const sameDescription = inv.description === descriptionValue

        return isPending && isNotExpired && sameAmount && sameDescription
      })

      if (existingInvoice) {
        // Reutilizar invoice existente
        console.log('[ReceiveLightning] Reusing existing invoice:', existingInvoice.paymentHash)
        setInvoiceData(existingInvoice)
        return
      }

      // Não encontrou invoice válida, gerar nova
      setLoading(true)
      try {
        const invoice = await generateInvoice(amountMsat, descriptionValue)
        setInvoiceData(invoice)
      } catch (error) {
        console.error('Error generating invoice:', error)
        Alert.alert('Error', 'Failed to generate Lightning invoice')
      } finally {
        setLoading(false)
      }
    }

    generate()
  }, [amountMsat, descriptionValue, state.isInitialized, state.invoices, generateInvoice])

  // Handle share invoice
  const handleShareInvoice = async () => {
    if (!invoiceData) {
      Alert.alert('Error', 'Please wait for invoice generation')
      return
    }

    try {
      await Share.share({
        message: `Lightning Invoice: ${invoiceData.invoice}`,
        url: `lightning:${invoiceData.invoice}`,
      })
    } catch (error) {
      console.error('Error sharing invoice:', error)
    }
  }

  // Handle copy invoice
  const handleCopyInvoice = async () => {
    if (!invoiceData) {
      Alert.alert('Error', 'Please wait for invoice generation')
      return
    }

    try {
      await Clipboard.setStringAsync(invoiceData.invoice)
      Alert.alert('Copied!', 'Invoice copied to clipboard')
    } catch (error) {
      console.error('Error copying to clipboard:', error)
      Alert.alert('Error', 'Failed to copy invoice to clipboard')
    }
  }

  function reduceInvoiceString(invoice: string): string {
    if (invoice.length <= 20) return invoice
    return `${invoice.slice(0, 10)}...${invoice.slice(-10)}`
  }

  // Se o serviço não está inicializado, mostrar loading ou erro
  if (!state.isInitialized && state.isLoading) {
    return (
      <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
        <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
          <View style={styles.qrContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.subtitle, isDark && styles.subtitleDark, { marginTop: 16 }]}>
              Initializing Lightning...
            </Text>
          </View>
        </View>
      </View>
    )
  }

  if (state.error) {
    return (
      <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
        <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            Lightning Error
          </Text>
          <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>{state.error}</Text>
        </View>
      </View>
    )
  }

  return (
    <View>
      <ScrollView style={[styles.scrollView, isDark && styles.scrollViewDark]}>
        <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
          {/* Loading State */}
          {loading ? (
            <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
              <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                Generating Invoice
              </Text>
              <View style={styles.qrContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.subtitle, isDark && styles.subtitleDark, { marginTop: 16 }]}>
                  Creating Lightning invoice...
                </Text>
              </View>
            </View>
          ) : invoiceData ? (
            <View
              style={[styles.sectionBox, isDark && styles.sectionBoxDark, styles.invoiceContainer]}
            >
              <View style={styles.qrContainer}>
                <QRCode
                  value={`lightning:${invoiceData.invoice}`}
                  size={320}
                  color={isDark ? colors.text.dark : colors.text.light}
                  backgroundColor="transparent"
                />
              </View>
              {/* On-chain fee warning when channel opening is required */}
              {!state.hasActiveChannels && (
                <OnChainFeeWarning isDark={isDark} estimatedFee={invoiceData.channelOpeningFee} />
              )}

              {/* Exibição da invoice */}
              <Text style={[styles.addressText, isDark && styles.addressTextDark]}>
                {reduceInvoiceString(invoiceData.invoice)}
              </Text>

              {/* Inputs abaixo do QRCode */}
              <View style={styles.inputsContainer}>
                <TextInput
                  style={[styles.input, isDark && styles.inputDark]}
                  placeholder="Amount (sats)"
                  placeholderTextColor={colors.textSecondary[isDark ? 'dark' : 'light']}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, isDark && styles.inputDark]}
                  placeholder="Description"
                  placeholderTextColor={colors.textSecondary[isDark ? 'dark' : 'light']}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 24,
                }}
              >
                <Button
                  tintColor={
                    isDark
                      ? alpha(colors.background.light, 0.05)
                      : alpha(colors.background.dark, 0.03)
                  }
                  style={{ flex: 1 }}
                  color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  startIcon={
                    <IconSymbol
                      name="doc.on.doc"
                      size={20}
                      color={colors.textSecondary[isDark ? 'dark' : 'light']}
                    />
                  }
                  onPress={handleCopyInvoice}
                >
                  Copy
                </Button>

                <Button
                  style={{ flex: 1 }}
                  tintColor={isDark ? alpha(colors.white, 0.05) : alpha(colors.black, 0.03)}
                  color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  startIcon={
                    <IconSymbol
                      name="square.and.arrow.up"
                      size={20}
                      color={colors.textSecondary[isDark ? 'dark' : 'light']}
                    />
                  }
                  onPress={handleShareInvoice}
                >
                  Share
                </Button>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  // Scroll and content
  scrollView: {},
  scrollViewDark: {},
  contentWrapper: {
    padding: 24,
    gap: 24,
  },
  contentWrapperDark: {},

  // Section
  sectionBox: {
    gap: 24,
  },
  sectionBoxDark: {},
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  subtitleDark: {
    color: colors.textSecondary.dark,
  },

  // QR
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Inputs
  inputsContainer: {
    gap: 12,
  },
  input: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: alpha(colors.black, 0.05),
    color: colors.text.light,
    fontSize: 16,
  },
  inputDark: {
    backgroundColor: alpha(colors.white, 0.05),
    color: colors.text.dark,
  },

  // Invoice
  invoiceContainer: {
    marginTop: 8,
  },
  addressText: {
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: '400',
    fontFamily: 'ui-monospace',
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  addressTextDark: {
    color: colors.textSecondary.dark,
  },

  // On-chain fee warning
  feeWarningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: alpha(colors.info, 0.1),
  },
  feeWarningContainerDark: {
    backgroundColor: alpha(colors.info, 0.15),
  },
  feeWarningTextContainer: {
    flex: 1,
    gap: 4,
  },
  feeWarningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
  },
  feeWarningTitleDark: {
    color: colors.text.dark,
  },
  feeWarningMessage: {
    fontSize: 14,
    color: colors.textSecondary.light,
    lineHeight: 20,
  },
  feeWarningMessageDark: {
    color: colors.textSecondary.dark,
  },
})
