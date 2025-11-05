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
  Modal,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/IconSymbol/IconSymbol'
import { useSettings } from '@/features/storage'
import QRCode from '@/ui/QRCode'
import Button from '@/ui/Button'
import { useLightningNetwork } from './useLightningNetwork'

export default function ReceiveLightning() {
  const { isDark } = useSettings()
  const { generateInvoice, isInitialized, isRunning } = useLightningNetwork()
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)
  const [lastGeneratedInvoice, setLastGeneratedInvoice] = useState<any>(null)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  // Invoice configuration
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('Pagamento via iHodl')

  // Generate invoice using Lightning Network hook
  const handleGenerateInvoice = useCallback(
    async (customAmount?: string, customDescription?: string) => {
      if (!isInitialized || !isRunning) {
        console.log('[ReceiveLightning] Lightning Network not ready, skipping invoice generation')
        return
      }

      setIsGeneratingInvoice(true)
      try {
        const amountValue = customAmount ? parseInt(customAmount) * 1000 : undefined // Convert to msats
        const desc = customDescription || description

        const invoice = await generateInvoice(amountValue, desc, 3600)

        setLastGeneratedInvoice(invoice)
        console.log('[ReceiveLightning] Generated invoice:', invoice.bolt11)
      } catch (error) {
        console.error('Error generating invoice:', error)
        Alert.alert('Erro', 'Falha ao gerar invoice. Tente novamente.')
      } finally {
        setIsGeneratingInvoice(false)
      }
    },
    [generateInvoice, isInitialized, isRunning, description],
  )

  // Regenerate invoice with advanced settings
  const handleRegenerateWithSettings = useCallback(async () => {
    await handleGenerateInvoice(amount, description)
    setShowAdvancedSettings(false)
  }, [handleGenerateInvoice, amount, description])

  useEffect(() => {
    // Auto-generate zero-amount invoice on component mount
    if (!lastGeneratedInvoice && !isGeneratingInvoice && isInitialized && isRunning) {
      handleGenerateInvoice()
    }
  }, [lastGeneratedInvoice, handleGenerateInvoice, isGeneratingInvoice, isInitialized, isRunning])

  // Share payment request
  const handleShare = async () => {
    if (!lastGeneratedInvoice?.bolt11) return

    try {
      const url = `lightning:${lastGeneratedInvoice.bolt11}`
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
    if (!lastGeneratedInvoice?.bolt11) return

    try {
      await Clipboard.setStringAsync(lastGeneratedInvoice.bolt11)
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

        {/* Payment Display */}
        {isGeneratingInvoice ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
              Gerando invoice...
            </Text>
          </View>
        ) : lastGeneratedInvoice?.bolt11 ? (
          <>
            {/* QR Code */}
            <View style={styles.qrContainer}>
              <QRCode
                value={`lightning:${lastGeneratedInvoice.bolt11}`}
                size={280}
                color={isDark ? colors.text.dark : colors.text.light}
                backgroundColor="transparent"
              />
            </View>
            {/* Exibição do endereço */}
            <Text style={[styles.addressText, isDark && styles.addressTextDark]}>
              {lastGeneratedInvoice.bolt11}
            </Text>

            {/* Payment Info */}
            <View style={styles.paymentInfo}>
              <Text style={[styles.amountDisplay, isDark && styles.amountDisplayDark]}>
                Valor:{' '}
                {lastGeneratedInvoice.amount
                  ? `${lastGeneratedInvoice.amount / 1000} sats`
                  : 'Valor variável'}
              </Text>
              {lastGeneratedInvoice.channelOpeningFee &&
                lastGeneratedInvoice.channelOpeningFee > 0 && (
                  <Text style={[styles.feeInfo, isDark && styles.feeInfoDark]}>
                    Inclui {lastGeneratedInvoice.channelOpeningFee} sats para abertura de canal
                  </Text>
                )}
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              <Button
                variant="glass"
                style={styles.button}
                onPress={handleCopy}
                startIcon={
                  <IconSymbol
                    name="doc.on.doc"
                    size={20}
                    color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  />
                }
              >
                Copiar
              </Button>

              <Button
                variant="glass"
                style={styles.button}
                onPress={handleShare}
                startIcon={
                  <IconSymbol
                    name="square.and.arrow.up"
                    size={20}
                    color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  />
                }
                // color={colors.primary}
              >
                Compartilhar
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

        <View style={[styles.sectionBox, isDark && styles.sectionBoxDark]}>
          <Button
            variant="glass"
            glassStyle={styles.settingsButton}
            onPress={() => setShowAdvancedSettings(true)}
            startIcon={<IconSymbol name="gear" size={20} color={colors.primary} />}
            color={colors.primary}
          >
            Configurações Avançadas
          </Button>
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

      {/* Advanced Settings Modal */}
      <Modal
        visible={showAdvancedSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAdvancedSettings(false)}
      >
        <ScrollView style={[styles.modalContainer, isDark && styles.modalContainerDark]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
              Configurações Avançadas
            </Text>
            <Button
              variant="solid"
              backgroundColor="transparent"
              onPress={() => setShowAdvancedSettings(false)}
            >
              <IconSymbol
                name="xmark"
                size={24}
                color={isDark ? colors.text.dark : colors.text.light}
              />
            </Button>
          </View>

          <View style={styles.modalContent}>
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

            <Button
              variant="solid"
              backgroundColor={colors.primary}
              onPress={handleRegenerateWithSettings}
              disabled={isGeneratingInvoice}
              startIcon={
                isGeneratingInvoice ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <IconSymbol name="bolt.fill" size={20} color={colors.white} />
                )
              }
            >
              {isGeneratingInvoice ? 'Gerando...' : 'Gerar Nova Invoice'}
            </Button>
          </View>
        </ScrollView>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    // flex: 1,
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
  configSection: {
    gap: 16,
    marginBottom: 16,
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
  qrContainer: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  amountDisplay: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.light,
    textAlign: 'center',
  },
  amountDisplayDark: {
    color: colors.text.dark,
  },
  feeInfo: {
    fontSize: 12,
    color: colors.textSecondary.light,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  feeInfoDark: {
    color: colors.textSecondary.dark,
  },
  expiryText: {
    fontSize: 12,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  expiryTextDark: {
    color: colors.textSecondary.dark,
  },
  buttonRow: {
    // backgroundColor: 'red',
    // width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    // alignItems: 'center',
    // justifyContent: 'center',
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

  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  modalContainerDark: {
    backgroundColor: colors.black,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.black, 0.1),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  modalTitleDark: {
    color: colors.text.dark,
  },
  modalContent: {
    padding: 16,
    gap: 16,
  },
  settingsButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  // Address
  addressText: {
    paddingHorizontal: 12,
    fontSize: 16,
    fontFamily: 'monospace',
    color: colors.text.light,
    textAlign: 'center',
  },
  addressTextDark: {
    color: colors.text.dark,
  },
})
