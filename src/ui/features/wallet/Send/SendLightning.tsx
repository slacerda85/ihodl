import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useIsDark } from '../../settings'
import { formatBalance } from '../utils'
import { useLightning } from '../../lightning/LightningProvider'

/**
 * SendLightning Component
 *
 * Componente dedicado para pagamentos Lightning Network.
 * Responsável por:
 * - Input e validação de invoices Lightning
 * - Decodificação e exibição de detalhes da invoice
 * - Envio de pagamentos Lightning
 */
export default function SendLightning() {
  const router = useRouter()
  const isDark = useIsDark()
  const { state: lightningState, sendPayment, decodeInvoice } = useLightning()

  const [submitting, setSubmitting] = useState<boolean>(false)
  const [lightningInvoice, setLightningInvoice] = useState<string>('')
  const [invoiceDecoded, setInvoiceDecoded] = useState<{
    amount: bigint
    description: string
    paymentHash: string
    isExpired: boolean
  } | null>(null)
  const [invoiceValid, setInvoiceValid] = useState<boolean | null>(null)

  // Effect to validate and decode Lightning invoice
  useEffect(() => {
    const validateAndDecodeInvoice = async () => {
      if (!lightningInvoice.trim()) {
        setInvoiceValid(null)
        setInvoiceDecoded(null)
        return
      }

      try {
        const decoded = await decodeInvoice(lightningInvoice)
        setInvoiceDecoded(decoded)

        if (decoded.isExpired) {
          setInvoiceValid(false)
        } else {
          setInvoiceValid(true)
        }
      } catch (error) {
        console.error('[SendLightning] Failed to decode invoice:', error)
        setInvoiceValid(false)
        setInvoiceDecoded(null)
      }
    }

    validateAndDecodeInvoice()
  }, [lightningInvoice, decodeInvoice])

  // Handle Lightning payment
  async function handleSendLightning() {
    setSubmitting(true)

    if (!lightningInvoice.trim()) {
      Alert.alert('Error', 'Please enter a Lightning invoice')
      setSubmitting(false)
      return
    }

    if (invoiceValid === false) {
      Alert.alert('Error', 'Invalid or expired Lightning invoice')
      setSubmitting(false)
      return
    }

    if (!lightningState.isInitialized) {
      Alert.alert('Error', 'Lightning is not initialized. Please try again.')
      setSubmitting(false)
      return
    }

    if (!lightningState.hasActiveChannels) {
      Alert.alert('Error', 'No active Lightning channels. Please open a channel first.')
      setSubmitting(false)
      return
    }

    try {
      console.log('[SendLightning] Sending Lightning payment...')
      const payment = await sendPayment(lightningInvoice)

      if (payment.status === 'succeeded') {
        console.log('[SendLightning] Lightning payment succeeded!')
        setSubmitting(false)
        Alert.alert(
          'Payment Sent',
          `Lightning payment successful!\n\nPayment Hash: ${payment.paymentHash.slice(0, 16)}...\nAmount: ${invoiceDecoded?.description || 'Payment'}`,
          [
            {
              text: 'OK',
              onPress: () => {
                router.back()
              },
            },
          ],
        )
      } else {
        console.log('[SendLightning] Lightning payment failed:', payment.error)
        Alert.alert('Error', `Payment failed: ${payment.error || 'Unknown error'}`)
        setSubmitting(false)
      }
    } catch (error) {
      console.error('[SendLightning] Lightning payment error:', error)
      Alert.alert('Error', `Payment failed: ${(error as Error).message}`)
      setSubmitting(false)
    }
  }

  const isButtonDisabled = submitting || invoiceValid !== true || !lightningState.hasActiveChannels

  return (
    <>
      {/* Invoice Input */}
      <View style={styles.section}>
        <Text style={[styles.label, isDark && styles.labelDark]}>Lightning Invoice</Text>
        <TextInput
          style={[
            styles.input,
            styles.invoiceInput,
            isDark && styles.inputDark,
            invoiceValid === false && styles.inputError,
            invoiceValid === true && styles.inputValid,
          ]}
          placeholder="Paste Lightning invoice (lnbc...)"
          placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          value={lightningInvoice}
          onChangeText={setLightningInvoice}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          numberOfLines={3}
        />
        {invoiceValid === false && (
          <Text style={styles.errorText}>Invalid or expired Lightning invoice</Text>
        )}
        {invoiceValid === true && <Text style={styles.validText}>✓ Valid Lightning invoice</Text>}
      </View>

      {/* Invoice Details */}
      {invoiceDecoded && invoiceValid && (
        <View style={[styles.section, styles.invoiceDetailsSection]}>
          <Text style={[styles.label, isDark && styles.labelDark]}>Invoice Details</Text>
          <View style={[styles.invoiceDetails, isDark && styles.invoiceDetailsDark]}>
            <View style={styles.invoiceDetailRow}>
              <Text style={[styles.invoiceDetailLabel, isDark && styles.invoiceDetailLabelDark]}>
                Amount:
              </Text>
              <Text style={[styles.invoiceDetailValue, isDark && styles.invoiceDetailValueDark]}>
                {invoiceDecoded.amount > 0n
                  ? `${(Number(invoiceDecoded.amount / 1000n) / 100000000).toFixed(8)} BTC`
                  : 'Not specified'}
              </Text>
            </View>
            {invoiceDecoded.description && (
              <View style={styles.invoiceDetailRow}>
                <Text style={[styles.invoiceDetailLabel, isDark && styles.invoiceDetailLabelDark]}>
                  Description:
                </Text>
                <Text style={[styles.invoiceDetailValue, isDark && styles.invoiceDetailValueDark]}>
                  {invoiceDecoded.description}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Lightning Balance */}
      <View style={styles.section}>
        <View style={styles.balanceContainer}>
          <Text style={[styles.balanceText, isDark && styles.balanceTextDark]}>
            Lightning Balance:{' '}
            {formatBalance(Number(lightningState.totalBalance / 1000n) / 100000000, 'BTC')} BTC
          </Text>
        </View>
        {!lightningState.hasActiveChannels && (
          <Text style={styles.warningText}>⚠️ No active Lightning channels</Text>
        )}
      </View>

      {/* Lightning Send Button */}
      <Pressable
        onPress={handleSendLightning}
        disabled={isButtonDisabled}
        style={[styles.button, styles.primaryButton, isButtonDisabled && styles.disabledButton]}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : null}
        <Text style={styles.buttonText}>{submitting ? 'Sending...' : 'Pay Lightning Invoice'}</Text>
      </Pressable>
    </>
  )
}

const styles = StyleSheet.create({
  // Section and inputs
  section: {
    marginBottom: 0,
  },
  label: {
    marginLeft: 16,
    fontSize: 14,
    fontWeight: '500',
    color: alpha(colors.textSecondary.light, 0.7),
    marginBottom: 8,
  },
  labelDark: {
    color: alpha(colors.textSecondary.dark, 0.7),
  },
  input: {
    padding: 16,
    height: 48,
    borderRadius: 32,
    backgroundColor: alpha(colors.black, 0.05),
    color: colors.text.light,
    fontSize: 16,
  },
  inputDark: {
    color: colors.text.dark,
    backgroundColor: alpha(colors.white, 0.1),
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  inputValid: {
    borderWidth: 1,
    borderColor: colors.success,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    marginTop: 4,
  },
  validText: {
    fontSize: 14,
    color: colors.success,
    marginTop: 4,
  },

  // Button
  button: {
    padding: 16,
    borderRadius: 32,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  disabledButton: {
    backgroundColor: alpha(colors.black, 0.2),
  },
  buttonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
  },

  // Balance
  balanceContainer: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  balanceText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    fontWeight: '500',
  },
  balanceTextDark: {
    color: colors.textSecondary.dark,
  },

  // Lightning Invoice styles
  invoiceInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  invoiceDetailsSection: {
    marginTop: 0,
  },
  invoiceDetails: {
    backgroundColor: alpha(colors.black, 0.05),
    borderRadius: 16,
    padding: 16,
  },
  invoiceDetailsDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  invoiceDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  invoiceDetailLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
    fontWeight: '500',
  },
  invoiceDetailLabelDark: {
    color: colors.textSecondary.dark,
  },
  invoiceDetailValue: {
    fontSize: 14,
    color: colors.text.light,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 8,
  },
  invoiceDetailValueDark: {
    color: colors.text.dark,
  },
  warningText: {
    fontSize: 14,
    color: colors.warning,
    marginTop: 8,
  },
})
