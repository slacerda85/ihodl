import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useSettings } from '../../settings'
import { formatBalance } from '../utils'
import { useAddress } from '../../address/AddressProvider'
import { useNetwork } from '../../network/NetworkProvider'
import AddressService from '@/core/services/address'
import TransactionService from '@/core/services/transaction'

/**
 * SendOnChain Component
 *
 * Componente dedicado para transações on-chain Bitcoin.
 * Responsável por:
 * - Input e validação de endereços Bitcoin
 * - Seleção de amount e fee rate
 * - Construção, assinatura e envio de transações
 */
export default function SendOnChain() {
  const router = useRouter()
  const { isDark } = useSettings()
  const { getConnection } = useNetwork()
  const { utxos, balance } = useAddress()

  const [submitting, setSubmitting] = useState<boolean>(false)
  const [recipientAddress, setRecipientAddress] = useState<string>('')
  const [amountInput, setAmountInput] = useState<string>('')
  const [amount, setAmount] = useState<number>(0)
  const [feeRate, setFeeRate] = useState<number>(1)
  const [memo, setMemo] = useState<string>('')
  const [autoFeeAdjustment, setAutoFeeAdjustment] = useState<boolean>(true)
  const [addressValid, setAddressValid] = useState<boolean | null>(null)
  const [amountValid, setAmountValid] = useState<boolean | null>(null)
  const [feeRates, setFeeRates] = useState<{
    slow: number
    normal: number
    fast: number
    urgent: number
  } | null>(null)
  const [loadingFeeRates, setLoadingFeeRates] = useState<boolean>(false)
  const [selectedFeeRate, setSelectedFeeRate] = useState<'slow' | 'normal' | 'fast' | 'urgent'>(
    'normal',
  )

  // Effect to validate address when it changes
  useEffect(() => {
    if (recipientAddress.trim()) {
      const addressService = new AddressService()
      const isValid = addressService.validateAddress(recipientAddress)
      setAddressValid(isValid)
    } else {
      setAddressValid(null)
    }
  }, [recipientAddress])

  // Effect to validate amount when feeRate, balance, or amount changes
  useEffect(() => {
    if (amount > 0) {
      const amountInSatoshis = Math.round(amount * 100000000)
      const feeRateInteger = Math.round(feeRate)
      const estimatedTxSize = autoFeeAdjustment && feeRates ? 200 + Math.random() * 100 : 250
      const estimatedFeeInSatoshis = Math.round(feeRateInteger * estimatedTxSize)
      const balanceInSatoshis = Math.round(balance * 100000000)

      if (amountInSatoshis + estimatedFeeInSatoshis > balanceInSatoshis) {
        setAmountValid(false)
      } else {
        setAmountValid(true)
      }
    } else {
      setAmountValid(null)
    }
  }, [feeRate, amount, autoFeeAdjustment, feeRates, balance])

  // Function to fetch recommended fee rates from network
  const fetchRecommendedFeeRates = useCallback(async () => {
    if (!autoFeeAdjustment) return

    setLoadingFeeRates(true)
    try {
      console.log('[SendOnChain] Fetching recommended fee rates from network...')
      const transactionService = new TransactionService()
      const connection = await getConnection()
      const rates = await transactionService.getFeeRates(connection)
      setFeeRates(rates)

      if (autoFeeAdjustment) {
        setFeeRate(rates.normal)
        setSelectedFeeRate('normal')
      }

      console.log('[SendOnChain] Fee rates updated:', rates)
      setLoadingFeeRates(false)
    } catch (error) {
      console.error('[SendOnChain] Failed to fetch fee rates:', error)
      if (!feeRates) {
        const fallbackRates = { slow: 1, normal: 2, fast: 5, urgent: 10 }
        setFeeRates(fallbackRates)
        if (autoFeeAdjustment) {
          setFeeRate(fallbackRates.normal)
          setSelectedFeeRate('normal')
        }
      }
      setLoadingFeeRates(false)
    }
  }, [autoFeeAdjustment, feeRates, getConnection])

  // Effect to fetch fee rates when auto-adjustment is enabled
  useEffect(() => {
    if (autoFeeAdjustment && !feeRates) {
      fetchRecommendedFeeRates()
    }
  }, [autoFeeAdjustment, feeRates, fetchRecommendedFeeRates])

  // Effect to update fee rate when selectedFeeRate changes
  useEffect(() => {
    if (feeRates && !autoFeeAdjustment) {
      setFeeRate(feeRates[selectedFeeRate])
    }
  }, [selectedFeeRate, feeRates, autoFeeAdjustment])

  // Function to normalize amount input (convert commas to dots)
  const normalizeAmount = (text: string): string => {
    return text.replace(/,/g, '.')
  }

  // Function to handle amount input changes
  const handleAmountChange = (text: string) => {
    const normalizedText = normalizeAmount(text)
    setAmountInput(normalizedText)
    const num = parseFloat(normalizedText)
    setAmount(isNaN(num) ? 0 : num)
  }

  async function handleSend() {
    setSubmitting(true)

    if (!recipientAddress.trim()) {
      Alert.alert('Error', 'Please enter a recipient address')
      setSubmitting(false)
      return
    }

    if (addressValid === false) {
      Alert.alert('Error', 'Please enter a valid Bitcoin address')
      setSubmitting(false)
      return
    }

    if (amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount')
      setSubmitting(false)
      return
    }

    const amountInSatoshis = Math.round(amount * 100000000)
    if (amountInSatoshis < 546) {
      Alert.alert('Error', `Amount must be at least 0.00000546 BTC (546 satoshis) to avoid dust`)
      setSubmitting(false)
      return
    }

    if (feeRate <= 0) {
      Alert.alert('Error', 'Please enter a valid fee rate')
      setSubmitting(false)
      return
    }

    console.log('[SendOnChain] Starting transaction assembly...')

    const confirmedUtxos = utxos.filter(utxo => utxo.confirmations >= 2)

    if (confirmedUtxos.length === 0) {
      Alert.alert('Error', 'No confirmed UTXOs available for transaction')
      setSubmitting(false)
      return
    }

    try {
      console.log('[SendOnChain] Retrieving wallet data...')

      const transactionService = new TransactionService()
      const addressService = new AddressService()
      const changeAddress = addressService.getNextChangeAddress()

      const feeRateInteger = Math.round(feeRate)
      console.log('[SendOnChain] feeRate (sat/vB)', feeRateInteger)

      const buildResult = await transactionService.buildTransaction({
        recipientAddress,
        amount: amountInSatoshis,
        feeRate: feeRateInteger,
        utxos: confirmedUtxos,
        changeAddress,
      })

      console.log('[SendOnChain] Signing transaction...')
      const signResult = await transactionService.signTransaction({
        transaction: buildResult.transaction,
        inputs: buildResult.inputs,
      })

      console.log('[SendOnChain] Sending transaction...')
      const sendResult = await transactionService.sendTransaction({
        signedTransaction: signResult.signedTransaction,
        txHex: signResult.txHex,
      })

      if (sendResult.success) {
        console.log('[SendOnChain] Transaction sent successfully...')

        await transactionService.savePendingTransaction({
          txid: sendResult.txid!,
          recipientAddress,
          amount: amountInSatoshis,
          fee: buildResult.fee,
          txHex: signResult.txHex,
        })
        console.log('[SendOnChain] Pending transaction saved to storage')

        setSubmitting(false)
        Alert.alert(
          'Transaction Sent',
          `Transaction successfully sent!\n\nTXID: ${sendResult.txid}\nAmount: ${amount.toFixed(8)} BTC\nFee: ${(buildResult.fee / 100000000).toFixed(8)} BTC`,
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
        console.log('[SendOnChain] Failed to send transaction:', sendResult.error)
        Alert.alert('Error', `Failed to send transaction: ${sendResult.error}`)
        setSubmitting(false)
      }
    } catch (error) {
      console.log('[SendOnChain] Transaction failed:', error)
      Alert.alert('Error', `Transaction failed: ${(error as Error).message}`)
      setSubmitting(false)
    }
  }

  return (
    <>
      <View style={styles.section}>
        <Text style={[styles.label, isDark && styles.labelDark]}>Recipient Address</Text>
        <TextInput
          style={[
            styles.input,
            isDark && styles.inputDark,
            addressValid === false && styles.inputError,
            addressValid === true && styles.inputValid,
          ]}
          placeholder="Enter Bitcoin address (bc1...)"
          placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          value={recipientAddress}
          onChangeText={setRecipientAddress}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {addressValid === false && <Text style={styles.errorText}>Invalid Bitcoin address</Text>}
        {addressValid === true && <Text style={styles.validText}>✓ Valid Bitcoin address</Text>}
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, isDark && styles.labelDark]}>Amount (BTC)</Text>
        <TextInput
          style={[
            styles.input,
            isDark && styles.inputDark,
            amountValid === false && styles.inputError,
            amountValid === true && styles.inputValid,
          ]}
          placeholder="0.00000000"
          placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          value={amountInput}
          onChangeText={handleAmountChange}
          keyboardType="decimal-pad"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {amountValid === false && amount <= 0 && (
          <Text style={styles.errorText}>Amount must be greater than 0</Text>
        )}
        {amountValid === false && amount > 0 && (
          <Text style={styles.errorText}>
            Insufficient balance including estimated fees. Remaining:{' '}
            {formatBalance(
              Math.max(0, balance - amount - (Math.round(feeRate) * 250) / 100000000),
              'BTC',
            )}{' '}
            {'BTC'}
          </Text>
        )}
        {amountValid === true && <Text style={styles.validText}>✓ Sufficient balance</Text>}
        <View style={styles.balanceContainer}>
          <Text style={[styles.balanceText, isDark && styles.balanceTextDark]}>
            Available: {formatBalance(balance, 'BTC')} {'BTC'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, isDark && styles.labelDark]}>Fee Rate (sat/vB)</Text>
        <View style={styles.feeHeader}>
          <Text style={[styles.autoFeeLabel, isDark && styles.autoFeeLabelDark]}>Auto-adjust</Text>
          <Switch
            value={autoFeeAdjustment}
            onValueChange={setAutoFeeAdjustment}
            trackColor={{ false: '#767577', true: colors.primary }}
            thumbColor={autoFeeAdjustment ? colors.white : '#f4f3f4'}
          />
        </View>
        {loadingFeeRates ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
              Fetching network fee rates...
            </Text>
          </View>
        ) : (
          <View style={[styles.feeRatesSelector, isDark && styles.feeRatesSelectorDark]}>
            {autoFeeAdjustment ? (
              <View style={styles.feeRatesGrid}>
                <View
                  style={[
                    styles.feeRateOption,
                    styles.feeRateOptionSelected,
                    isDark && styles.feeRateOptionDark,
                  ]}
                >
                  <Text style={[styles.feeRateLabel, isDark && styles.feeRateLabelDark]}>
                    Normal
                  </Text>
                  <Text style={[styles.feeRateValue, isDark && styles.feeRateValueDark]}>
                    {feeRates?.normal} sat/vB
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.feeRatesGrid}>
                <Pressable
                  style={[
                    styles.feeRateOption,
                    selectedFeeRate === 'slow' && styles.feeRateOptionSelected,
                    isDark && styles.feeRateOptionDark,
                  ]}
                  onPress={() => setSelectedFeeRate('slow')}
                >
                  <Text style={[styles.feeRateLabel, isDark && styles.feeRateLabelDark]}>Slow</Text>
                  <Text style={[styles.feeRateValue, isDark && styles.feeRateValueDark]}>
                    {feeRates?.slow} sat/vB
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.feeRateOption,
                    selectedFeeRate === 'normal' && styles.feeRateOptionSelected,
                    isDark && styles.feeRateOptionDark,
                  ]}
                  onPress={() => setSelectedFeeRate('normal')}
                >
                  <Text style={[styles.feeRateLabel, isDark && styles.feeRateLabelDark]}>
                    Normal
                  </Text>
                  <Text style={[styles.feeRateValue, isDark && styles.feeRateValueDark]}>
                    {feeRates?.normal} sat/vB
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.feeRateOption,
                    selectedFeeRate === 'fast' && styles.feeRateOptionSelected,
                    isDark && styles.feeRateOptionDark,
                  ]}
                  onPress={() => setSelectedFeeRate('fast')}
                >
                  <Text style={[styles.feeRateLabel, isDark && styles.feeRateLabelDark]}>Fast</Text>
                  <Text style={[styles.feeRateValue, isDark && styles.feeRateValueDark]}>
                    {feeRates?.fast} sat/vB
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.feeRateOption,
                    selectedFeeRate === 'urgent' && styles.feeRateOptionSelected,
                    isDark && styles.feeRateOptionDark,
                  ]}
                  onPress={() => setSelectedFeeRate('urgent')}
                >
                  <Text style={[styles.feeRateLabel, isDark && styles.feeRateLabelDark]}>
                    Urgent
                  </Text>
                  <Text style={[styles.feeRateValue, isDark && styles.feeRateValueDark]}>
                    {feeRates?.urgent} sat/vB
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={styles.infoBox}>
          <IconSymbol
            name="info.circle.fill"
            size={16}
            style={styles.infoIcon}
            color={
              isDark
                ? alpha(colors.textSecondary.dark, 0.7)
                : alpha(colors.textSecondary.light, 0.7)
            }
          />
          <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
            {autoFeeAdjustment
              ? loadingFeeRates
                ? 'Loading current network conditions...'
                : 'Fee rate is automatically adjusted based on network conditions.'
              : 'Higher fee rates result in faster confirmation times.'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.label, isDark && styles.labelDark]}>Memo (Optional)</Text>
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          placeholder="Add a note for this transaction"
          placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          value={memo}
          onChangeText={setMemo}
          multiline
          numberOfLines={3}
        />
      </View>

      <Pressable
        onPress={handleSend}
        disabled={submitting || amountValid === false}
        style={[styles.button, styles.primaryButton, submitting && styles.disabledButton]}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : null}
        <Text style={styles.buttonText}>{submitting ? 'Sending...' : 'Send Bitcoin'}</Text>
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

  // Fee
  feeHeader: {
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoFeeLabel: {
    paddingVertical: 8,
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  autoFeeLabelDark: {
    color: colors.textSecondary.dark,
  },
  infoBox: {
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: alpha(colors.textSecondary.light, 0.7),
  },
  infoTextDark: {
    color: alpha(colors.textSecondary.dark, 0.7),
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

  // Loading
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  loadingTextDark: {
    color: colors.textSecondary.dark,
  },

  // Fee rates
  feeRatesSelector: {
    marginTop: 8,
    padding: 12,
    backgroundColor: alpha(colors.black, 0.05),
    borderRadius: 32,
  },
  feeRatesSelectorDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  feeRatesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  feeRateOption: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
    backgroundColor: alpha(colors.white, 0.1),
    borderRadius: 24,
  },
  feeRateOptionDark: {
    backgroundColor: alpha(colors.black, 0.1),
  },
  feeRateOptionSelected: {
    backgroundColor: alpha(colors.primary, 0.2),
    borderColor: colors.primary,
  },
  feeRateLabel: {
    fontSize: 11,
    color: colors.textSecondary.light,
    marginBottom: 2,
  },
  feeRateLabelDark: {
    color: colors.textSecondary.dark,
  },
  feeRateValue: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.light,
  },
  feeRateValueDark: {
    color: colors.text.dark,
  },
})
