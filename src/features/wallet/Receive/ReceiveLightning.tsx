import { useState, useEffect, useCallback } from 'react'
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
import { IconSymbol } from '@/ui/IconSymbol/IconSymbol'
import { useSettings } from '@/features/storage'
import { useLightning } from '@/features/storage'
import { useStorage } from '@/features/storage'
import QRCode from '@/ui/QRCode'
import Button from '@/ui/Button'
import { breezClient } from '@/lib/lightning/client'

export default function ReceiveLightning() {
  const { isDark } = useSettings()
  const { state } = useStorage()
  const { receivePayment, initializeBreezWithActiveWallet } = useLightning()

  // Payment state
  const [paymentRequest, setPaymentRequest] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Invoice configuration
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('Pagamento via iHodl')

  // Auto-generate invoice on mount and when config changes
  const generateInvoice = useCallback(async () => {
    // Check if there's an active wallet first
    const activeWalletId = state.wallet?.activeWalletId
    if (!activeWalletId) {
      Alert.alert(
        'Erro',
        'Nenhuma carteira ativa encontrada. Crie ou selecione uma carteira primeiro.',
      )
      return
    }

    // Initialize Breez if not connected
    try {
      if (!breezClient.isConnected()) {
        console.log('Initializing Breez SDK...')
        await initializeBreezWithActiveWallet()
      }

      // Verify connection
      await breezClient.getInfo()
    } catch (error) {
      console.error('BreezClient initialization failed:', error)
      Alert.alert('Erro', 'Falha ao conectar com a rede Lightning. Tente novamente.')
      return
    }

    setIsGenerating(true)
    try {
      const request = {
        paymentMethod: {
          type: 'bolt11Invoice' as const,
          description: description || 'Pagamento via iHodl',
          amountSats: amount ? parseInt(amount) : undefined,
        },
      }

      const response = await receivePayment(request)
      setPaymentRequest(response.paymentRequest)

      if (response.feeSats > 0) {
        console.log(`Receive fee: ${response.feeSats} sats`)
      }
    } catch (error) {
      console.error('Error generating invoice:', error)
      Alert.alert('Erro', 'Falha ao gerar invoice Lightning')
    } finally {
      setIsGenerating(false)
    }
  }, [
    amount,
    description,
    state.wallet?.activeWalletId,
    initializeBreezWithActiveWallet,
    receivePayment,
  ])

  useEffect(() => {
    generateInvoice()
  }, [generateInvoice])

  // Share payment request
  const handleShare = async () => {
    if (!paymentRequest) return

    try {
      const url = `lightning:${paymentRequest}`
      await Share.share({
        message: `Pagamento Lightning: ${url}`,
        url,
      })
    } catch (error) {
      console.error('Error sharing payment request:', error)
    }
  }

  // Copy payment request
  const handleCopy = async () => {
    if (!paymentRequest) return

    try {
      await Clipboard.setStringAsync(paymentRequest)
      Alert.alert('Copiado!', 'Invoice copiada para a área de transferência')
    } catch (error) {
      console.error('Error copying payment request:', error)
      Alert.alert('Erro', 'Falha ao copiar')
    }
  }

  return (
    <ScrollView style={[styles.scrollView, isDark && styles.scrollViewDark]}>
      <View style={styles.contentWrapper}>
        {/* Header */}
        <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            Receber via Lightning
          </Text>

          {/* Configuration */}
          <View style={styles.configSection}>
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>
                Valor (sats) - opcional
              </Text>
              <View style={[styles.inputWrapper, isDark && styles.inputWrapperDark]}>
                <TextInput
                  style={[styles.input, isDark && styles.inputDark]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary.light}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Descrição</Text>
              <View style={[styles.inputWrapper, isDark && styles.inputWrapperDark]}>
                <TextInput
                  style={[styles.input, isDark && styles.inputDark]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Descrição do pagamento"
                  placeholderTextColor={colors.textSecondary.light}
                />
              </View>
            </View>
          </View>

          {/* Payment Display */}
          {isGenerating ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
                Gerando invoice...
              </Text>
            </View>
          ) : paymentRequest ? (
            <>
              {/* QR Code */}
              <View style={styles.qrContainer}>
                <QRCode
                  value={`lightning:${paymentRequest}`}
                  size={280}
                  color={isDark ? colors.text.dark : colors.text.light}
                  backgroundColor="transparent"
                />
              </View>

              {/* Payment Info */}
              <View style={styles.paymentInfo}>
                <Text style={[styles.paymentType, isDark && styles.paymentTypeDark]}>
                  BOLT11 Invoice
                </Text>
                {amount && (
                  <Text style={[styles.amountDisplay, isDark && styles.amountDisplayDark]}>
                    {amount} sats
                  </Text>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonRow}>
                <Button
                  variant="glass"
                  glassStyle={[styles.button, styles.secondaryButton]}
                  onPress={handleCopy}
                  startIcon={<IconSymbol name="doc.on.doc" size={20} color={colors.primary} />}
                >
                  <Text style={styles.secondaryButtonText}>Copiar</Text>
                </Button>

                <Button
                  variant="glass"
                  glassStyle={[styles.button, styles.secondaryButton]}
                  onPress={handleShare}
                  startIcon={
                    <IconSymbol name="square.and.arrow.up" size={20} color={colors.primary} />
                  }
                >
                  <Text style={styles.secondaryButtonText}>Compartilhar</Text>
                </Button>
              </View>
            </>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={[styles.errorText, isDark && styles.errorTextDark]}>
                Falha ao gerar invoice. Verifique sua conexão e tente novamente.
              </Text>
            </View>
          )}
        </View>

        {/* Info Section */}
        <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
          <IconSymbol name="bolt.fill" size={20} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, isDark && styles.infoTitleDark]}>
              Sobre Recebimento Lightning
            </Text>
            <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
              • Pagamentos são instantâneos e têm taxas mínimas{'\n'}• Funciona mesmo quando o
              dispositivo está offline{'\n'}• Aceite pagamentos de qualquer carteira Lightning
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
  container: {
    flex: 1,
    // backgroundColor: colors.background.light,
  },
  containerDark: {
    // backgroundColor: colors.background.dark,
  },
  contentWrapper: {
    // paddingHorizontal: 24,
    padding: 16,
    gap: 24,
  },
  sectionBox: {
    // backgroundColor: colors.white,
    paddingVertical: 16,
    // paddingHorizontal: 16,
    borderRadius: 16,
    gap: 16,
  },
  sectionBoxDark: {
    // backgroundColor: alpha(colors.background.light, 0.05),
  },
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
  },
  inputDark: {
    color: colors.text.dark,
  },
  amountButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  amountButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: alpha(colors.primary, 0.1),
  },
  amountButtonDark: {
    backgroundColor: alpha(colors.primary, 0.2),
  },
  amountButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  amountButtonTextDark: {
    color: colors.primary,
  },
  qrContainer: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceLabel: {
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  invoiceLabelDark: {
    color: colors.textSecondary.dark,
  },
  invoiceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
  },
  invoiceValueDark: {
    color: colors.text.dark,
  },
  invoiceText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.text.light,
    textAlign: 'center',
    lineHeight: 16,
  },
  invoiceTextDark: {
    color: colors.text.dark,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonDark: {
    borderColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '500',
    fontSize: 16,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: '500',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
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
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.primary,
  },
  loadingTextDark: {
    color: colors.primary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  configButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  configButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  configSection: {
    gap: 16,
    marginBottom: 16,
  },
  warningBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    backgroundColor: alpha(colors.warning, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.warning, 0.3),
    marginBottom: 16,
  },
  warningBoxDark: {
    backgroundColor: alpha(colors.warning, 0.1),
    borderColor: alpha(colors.warning, 0.3),
  },
  warningContent: {
    flex: 1,
    marginLeft: 8,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning,
    marginBottom: 2,
  },
  warningTitleDark: {
    color: colors.warning,
  },
  warningText: {
    fontSize: 12,
    color: colors.textSecondary.light,
    lineHeight: 16,
  },
  warningTextDark: {
    color: colors.textSecondary.dark,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    backgroundColor: alpha(colors.success, 0.1),
    marginBottom: 16,
  },
  statusBoxDark: {
    backgroundColor: alpha(colors.success, 0.1),
  },
  statusText: {
    fontSize: 12,
    color: colors.success,
    marginLeft: 6,
    fontWeight: '500',
  },
  statusTextDark: {
    color: colors.success,
  },
  lspStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 4,
    backgroundColor: alpha(colors.primary, 0.1),
    marginBottom: 16,
  },
  lspStatusBoxDark: {
    backgroundColor: alpha(colors.primary, 0.1),
  },
  lspStatusText: {
    fontSize: 12,
    color: colors.primary,
    marginLeft: 6,
    fontWeight: '500',
  },
  lspStatusTextDark: {
    color: colors.primary,
  },
  setupSection: {
    gap: 16,
    marginBottom: 16,
  },
  addressInfo: {
    gap: 12,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary.light,
  },
  addressLabelDark: {
    color: colors.textSecondary.dark,
  },
  addressValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
    fontFamily: 'monospace',
  },
  addressValueDark: {
    color: colors.text.dark,
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  methodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addressSetup: {
    gap: 16,
  },
  setupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
  },
  setupTitleDark: {
    color: colors.text.dark,
  },
  setupDescription: {
    fontSize: 14,
    color: colors.textSecondary.light,
    lineHeight: 20,
  },
  setupDescriptionDark: {
    color: colors.textSecondary.dark,
  },
  usernameInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: alpha(colors.black, 0.1),
    borderRadius: 12,
    padding: 12,
    backgroundColor: alpha(colors.black, 0.02),
  },
  domainText: {
    fontSize: 16,
    color: colors.textSecondary.light,
    marginLeft: 4,
  },
  domainTextDark: {
    color: colors.textSecondary.dark,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  checkButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  availabilityStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  availabilityText: {
    fontSize: 14,
    fontWeight: '500',
  },
  availabilityTextDark: {
    // Inherits from availabilityText
  },
  registerButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  paymentInfo: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  paymentType: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  paymentTypeDark: {
    color: colors.primary,
  },
  addressDisplay: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.light,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  addressDisplayDark: {
    color: colors.text.dark,
  },
  amountDisplay: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.light,
    textAlign: 'center',
  },
  amountDisplayDark: {
    color: colors.text.dark,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
    textAlign: 'center',
  },
  errorTextDark: {
    color: colors.error,
  },
})
