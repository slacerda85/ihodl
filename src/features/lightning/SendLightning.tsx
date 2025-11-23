import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useSettings } from '@/features/settings'
import Button from '@/ui/components/Button'

export default function SendLightning() {
  const { isDark } = useSettings()

  const [invoice, setInvoice] = useState('')
  const [isPreparing, setIsPreparing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [preparedPayment, setPreparedPayment] = useState<any>(null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [showDetails, setShowDetails] = useState(false)

  // Mock Breez client functions
  const mockPrepareSendPayment = async (params: any) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Mock payment preparation response
    const mockAmount = amount ? parseInt(amount) * 1000 : 1000000 // Default 1000 sats in msats
    const mockFee = Math.floor(mockAmount * 0.001) // 0.1% fee

    return {
      id: 'mock-payment-' + Date.now(),
      amountMsat: mockAmount,
      feeMsat: mockFee,
      bolt11: params.bolt11,
    }
  }

  const mockSendPayment = async (params: any) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Mock successful payment (no error thrown)
    return { success: true }
  }

  // Invoice validation
  const isValidInvoice = (inv: string): boolean => {
    if (!inv || inv.trim().length === 0) return false
    const trimmed = inv.trim()

    // Basic Lightning invoice validation (starts with 'lnbc' or 'lntb')
    return trimmed.startsWith('lnbc') || trimmed.startsWith('lntb')
  }

  // Parse invoice amount and description
  const parseInvoice = (inv: string) => {
    try {
      // This is a simplified parser - in a real implementation you'd use a proper Lightning invoice parser
      // For now, we'll extract basic info from the invoice string
      if (inv.includes('lnbc')) {
        // Extract amount if present (simplified)
        const amountMatch = inv.match(/lnbc(\d+)/)
        if (amountMatch) {
          const sats = parseInt(amountMatch[1])
          setAmount((sats / 1000).toString()) // Convert msats to sats
        }

        // Extract description if present (simplified)
        const descMatch = inv.match(/d=([^&]+)/)
        if (descMatch) {
          setDescription(decodeURIComponent(descMatch[1]))
        }
      }
    } catch (error) {
      console.error('Error parsing invoice:', error)
    }
  }

  // Handle invoice input change
  const handleInvoiceChange = (text: string) => {
    setInvoice(text)
    setPreparedPayment(null)
    setAmount('')
    setDescription('')

    if (isValidInvoice(text)) {
      parseInvoice(text)
    }
  }

  // Prepare payment
  const handlePreparePayment = async () => {
    if (!isValidInvoice(invoice)) {
      Alert.alert('Erro', 'Por favor insira uma invoice Lightning válida')
      return
    }

    setIsPreparing(true)
    try {
      const result = await mockPrepareSendPayment({
        bolt11: invoice,
      })

      setPreparedPayment(result)
      setShowDetails(true)
    } catch (error) {
      console.error('Error preparing payment:', error)
      Alert.alert('Erro', 'Falha ao preparar pagamento Lightning')
    } finally {
      setIsPreparing(false)
    }
  }

  // Send payment
  const handleSendPayment = async () => {
    if (!preparedPayment) return

    setIsSending(true)
    try {
      await mockSendPayment({
        paymentId: preparedPayment.id,
      })

      // Payment was successful if no error was thrown
      Alert.alert('Sucesso!', 'Pagamento Lightning enviado com sucesso!')
      // Reset form
      setInvoice('')
      setPreparedPayment(null)
      setAmount('')
      setDescription('')
      setShowDetails(false)
    } catch (error) {
      console.error('Error sending payment:', error)
      Alert.alert('Erro', 'Falha ao enviar pagamento Lightning')
    } finally {
      setIsSending(false)
    }
  }

  // Copy invoice from clipboard
  const handlePasteInvoice = async () => {
    try {
      const clipboardContent = await Clipboard.getStringAsync()
      if (clipboardContent) {
        handleInvoiceChange(clipboardContent)
      }
    } catch (error) {
      console.error('Error pasting from clipboard:', error)
      Alert.alert('Erro', 'Falha ao colar da área de transferência')
    }
  }

  return (
    <ScrollView style={[styles.scrollView, isDark && styles.scrollViewDark]}>
      <View style={styles.contentWrapper}>
        {/* Invoice Input */}
        <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
              Enviar via Lightning
            </Text>
            <Button
              variant="glass"
              glassStyle={styles.pasteButton}
              onPress={handlePasteInvoice}
              startIcon={<IconSymbol name="doc.on.clipboard" size={16} color={colors.primary} />}
            >
              <Text style={styles.pasteButtonText}>Colar</Text>
            </Button>
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>
              Invoice Lightning
            </Text>
            <View style={[styles.inputWrapper, isDark && styles.inputWrapperDark]}>
              <TextInput
                style={[styles.input, isDark && styles.inputDark]}
                value={invoice}
                onChangeText={handleInvoiceChange}
                placeholder="Cole a invoice Lightning (lnbc...)"
                placeholderTextColor={colors.textSecondary.light}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
            {invoice && !isValidInvoice(invoice) && (
              <Text style={styles.errorText}>Invoice Lightning inválida</Text>
            )}
            {invoice && isValidInvoice(invoice) && (
              <Text style={styles.validText}>✓ Invoice válida</Text>
            )}
          </View>

          {/* Invoice Details */}
          {amount && (
            <View style={styles.invoiceDetail}>
              <Text style={[styles.detailLabel, isDark && styles.detailLabelDark]}>Valor:</Text>
              <Text style={[styles.detailValue, isDark && styles.detailValueDark]}>
                {amount} sats
              </Text>
            </View>
          )}

          {description && (
            <View style={styles.invoiceDetail}>
              <Text style={[styles.detailLabel, isDark && styles.detailLabelDark]}>Descrição:</Text>
              <Text style={[styles.detailValue, isDark && styles.detailValueDark]}>
                {description}
              </Text>
            </View>
          )}

          {/* Prepare Payment Button */}
          {!preparedPayment && (
            <Button
              variant="solid"
              backgroundColor={colors.primary}
              glassStyle={styles.button}
              onPress={handlePreparePayment}
              disabled={!isValidInvoice(invoice) || isPreparing}
              startIcon={
                isPreparing ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <IconSymbol name="bolt.fill" size={20} color={colors.white} />
                )
              }
            >
              <Text style={styles.primaryButtonText}>
                {isPreparing ? 'Preparando...' : 'Preparar Pagamento'}
              </Text>
            </Button>
          )}

          {/* Payment Details */}
          {preparedPayment && showDetails && (
            <View style={[styles.paymentDetails, isDark && styles.paymentDetailsDark]}>
              <Text style={[styles.detailsTitle, isDark && styles.detailsTitleDark]}>
                Detalhes do Pagamento
              </Text>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, isDark && styles.detailLabelDark]}>Valor:</Text>
                <Text style={[styles.detailValue, isDark && styles.detailValueDark]}>
                  {preparedPayment.amountMsat / 1000} sats
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, isDark && styles.detailLabelDark]}>Taxa:</Text>
                <Text style={[styles.detailValue, isDark && styles.detailValueDark]}>
                  {preparedPayment.feeMsat / 1000} sats
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, isDark && styles.detailLabelDark]}>Total:</Text>
                <Text style={[styles.detailValue, isDark && styles.detailValueDark]}>
                  {(preparedPayment.amountMsat + preparedPayment.feeMsat) / 1000} sats
                </Text>
              </View>
            </View>
          )}

          {/* Send Payment Button */}
          {preparedPayment && (
            <Button
              variant="solid"
              backgroundColor={colors.success}
              glassStyle={styles.button}
              onPress={handleSendPayment}
              disabled={isSending}
              startIcon={
                isSending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <IconSymbol name="paperplane.fill" size={20} color={colors.white} />
                )
              }
            >
              <Text style={styles.primaryButtonText}>
                {isSending ? 'Enviando...' : 'Confirmar Pagamento'}
              </Text>
            </Button>
          )}
        </View>

        {/* Info Section */}
        <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
          <IconSymbol name="bolt.fill" size={20} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, isDark && styles.infoTitleDark]}>
              Sobre Pagamentos Lightning
            </Text>
            <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
              • Pagamentos instantâneos e de baixo custo{'\n'}• Conectado via Breez SDK para máxima
              privacidade{'\n'}• Suporte a invoices padrão do Lightning Network{'\n'}• Sem
              necessidade de saldo on-chain
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollViewDark: {
    // No additional styles needed
  },
  contentWrapper: {
    padding: 16,
    gap: 24,
  },
  sectionBox: {
    paddingVertical: 16,
    borderRadius: 16,
    gap: 16,
  },
  sectionBoxDark: {
    // No additional styles needed
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  pasteButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  inputContainer: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
  },
  inputLabelDark: {
    color: colors.text.dark,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: alpha(colors.black, 0.1),
    borderRadius: 12,
    padding: 12,
    backgroundColor: alpha(colors.black, 0.02),
  },
  inputWrapperDark: {
    borderColor: alpha(colors.white, 0.2),
    backgroundColor: alpha(colors.white, 0.05),
  },
  input: {
    fontSize: 16,
    color: colors.text.light,
    minHeight: 80,
  },
  inputDark: {
    color: colors.text.dark,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
  },
  validText: {
    fontSize: 14,
    color: colors.success,
  },
  invoiceDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  detailLabelDark: {
    color: colors.textSecondary.dark,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
  },
  detailValueDark: {
    color: colors.text.dark,
  },
  paymentDetails: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: alpha(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.2),
  },
  paymentDetailsDark: {
    backgroundColor: alpha(colors.primary, 0.1),
    borderColor: alpha(colors.primary, 0.2),
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 12,
  },
  detailsTitleDark: {
    color: colors.primary,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '500',
    fontSize: 16,
  },
  infoBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    backgroundColor: alpha(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.2),
  },
  infoBoxDark: {
    backgroundColor: alpha(colors.primary, 0.1),
    borderColor: alpha(colors.primary, 0.2),
  },
  infoIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 4,
  },
  infoTitleDark: {
    color: colors.text.dark,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    lineHeight: 20,
  },
  infoTextDark: {
    color: colors.textSecondary.dark,
  },
})
