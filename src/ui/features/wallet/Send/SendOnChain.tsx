import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
import { useIsDark, useBalance } from '@/ui/features/app-provider'
import { formatBalance } from '../utils'
import { useNetwork } from '../../network/NetworkProvider'
import { addressService, transactionService } from '@/core/services'
import CoinSelectionOptions from './CoinSelectionOptions'
import AdvancedTransactionOptions from './AdvancedTransactionOptions'
import AdvancedFeeEstimation from './AdvancedFeeEstimation'

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
  const isDark = useIsDark()
  const { getConnection } = useNetwork()
  const { utxos, balance } = useBalance()

  const [submitting, setSubmitting] = useState<boolean>(false)
  const [recipientAddress, setRecipientAddress] = useState<string>('')
  const [amountInput, setAmountInput] = useState<string>('')
  const [amount, setAmount] = useState<number>(0)
  const [memo, setMemo] = useState<string>('')
  const [autoFeeAdjustment, setAutoFeeAdjustment] = useState<boolean>(true)
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

  // Batch transactions state
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false)
  const [batchTransactions, setBatchTransactions] = useState<
    Array<{
      id: string
      recipientAddress: string
      amount: number
      memo?: string
    }>
  >([])

  // Advanced options state
  const [coinSelectionAlgorithm, setCoinSelectionAlgorithm] = useState<
    'largest_first' | 'smallest_first' | 'branch_and_bound' | 'random' | 'privacy_focused'
  >('branch_and_bound')
  const [avoidAddressReuse, setAvoidAddressReuse] = useState<boolean>(false)
  const [consolidateSmallUtxos, setConsolidateSmallUtxos] = useState<boolean>(false)
  const [enableRBF, setEnableRBF] = useState<boolean>(false)
  const [sighashType, setSighashType] = useState<'ALL' | 'NONE' | 'SINGLE' | 'ANYONECANPAY'>('ALL')
  const [enableCPFP, setEnableCPFP] = useState<boolean>(false)
  const [cpfpTargetFeeRate, setCpfpTargetFeeRate] = useState<number>(10)

  // Refs para evitar múltiplas chamadas
  const feeRatesFetchedRef = useRef(false)

  // Validação de endereço derivada via useMemo (não causa re-render extra)
  const addressValid = useMemo(() => {
    if (!recipientAddress.trim()) return null
    return addressService.validateAddress(recipientAddress)
  }, [recipientAddress])

  // Fee rate efetivo derivado (sem state duplicado)
  const feeRate = useMemo(() => {
    if (feeRates) {
      return feeRates[selectedFeeRate]
    }
    return 1 // fallback
  }, [feeRates, selectedFeeRate])

  // Validação de amount derivada via useMemo
  const amountValid = useMemo(() => {
    if (amount <= 0) return null

    const amountInSatoshis = Math.round(amount * 100000000)
    const feeRateInteger = Math.round(feeRate)
    const estimatedTxSize = 250
    const estimatedFeeInSatoshis = Math.round(feeRateInteger * estimatedTxSize)
    const balanceInSatoshis = Math.round(balance * 100000000)

    return amountInSatoshis + estimatedFeeInSatoshis <= balanceInSatoshis
  }, [feeRate, amount, balance])

  // Function to fetch recommended fee rates from network
  const fetchRecommendedFeeRates = useCallback(async () => {
    if (feeRatesFetchedRef.current) return
    feeRatesFetchedRef.current = true

    setLoadingFeeRates(true)
    try {
      console.log('[SendOnChain] Fetching recommended fee rates from network...')
      const connection = await getConnection()
      const rates = await transactionService.getFeeRates(connection)
      setFeeRates(rates)
      setSelectedFeeRate('normal')
      console.log('[SendOnChain] Fee rates updated:', rates)
    } catch (error) {
      console.error('[SendOnChain] Failed to fetch fee rates:', error)
      const fallbackRates = { slow: 1, normal: 2, fast: 5, urgent: 10 }
      setFeeRates(fallbackRates)
      setSelectedFeeRate('normal')
    } finally {
      setLoadingFeeRates(false)
    }
  }, [getConnection])

  // Effect to fetch fee rates quando componente monta
  useEffect(() => {
    fetchRecommendedFeeRates()
  }, [fetchRecommendedFeeRates])

  // Function to add transaction to batch
  const addToBatch = useCallback(() => {
    if (!recipientAddress.trim() || addressValid !== true || amount <= 0 || amountValid !== true) {
      Alert.alert(
        'Error',
        'Please fill in valid recipient address and amount before adding to batch',
      )
      return
    }

    const newTransaction = {
      id: Date.now().toString(),
      recipientAddress,
      amount,
      memo: memo.trim() || undefined,
    }

    setBatchTransactions(prev => [...prev, newTransaction])
    // Clear current inputs
    setRecipientAddress('')
    setAmountInput('')
    setAmount(0)
    setMemo('')
  }, [recipientAddress, addressValid, amount, amountValid, memo])

  // Function to remove transaction from batch
  const removeFromBatch = useCallback((id: string) => {
    setBatchTransactions(prev => prev.filter(tx => tx.id !== id))
  }, [])

  // Function to normalize amount input (convert commas to dots)
  const normalizeAmount = (text: string): string => {
    return text.replace(/,/g, '.')
  }
  const validateBatchTransactions = useCallback(() => {
    if (batchTransactions.length === 0) return false

    const totalAmount = batchTransactions.reduce((sum, tx) => sum + tx.amount, 0)
    const totalAmountInSatoshis = Math.round(totalAmount * 100000000)
    const feeRateInteger = Math.round(feeRate)
    const estimatedTxSize = 250 + (batchTransactions.length - 1) * 150 // Base tx + additional outputs
    const estimatedFeeInSatoshis = Math.round(feeRateInteger * estimatedTxSize)
    const balanceInSatoshis = Math.round(balance * 100000000)

    return totalAmountInSatoshis + estimatedFeeInSatoshis <= balanceInSatoshis
  }, [batchTransactions, feeRate, balance])

  // Function to handle amount input changes
  const handleAmountChange = (text: string) => {
    const normalizedText = normalizeAmount(text)
    setAmountInput(normalizedText)
    const num = parseFloat(normalizedText)
    setAmount(isNaN(num) ? 0 : num)
  }

  async function handleSendBatch() {
    if (batchTransactions.length === 0) {
      Alert.alert('Error', 'No transactions in batch')
      return
    }

    if (!validateBatchTransactions()) {
      Alert.alert('Error', 'Insufficient balance for batch transaction')
      return
    }

    setSubmitting(true)

    try {
      console.log('[SendOnChain] Starting batch transaction assembly...')

      const confirmedUtxos = utxos.filter(utxo => utxo.confirmations >= 2)

      if (confirmedUtxos.length === 0) {
        Alert.alert('Error', 'No confirmed UTXOs available for transaction')
        setSubmitting(false)
        return
      }

      const changeAddress = addressService.getNextChangeAddress()
      const feeRateInteger = Math.round(feeRate)

      // Build batch transaction
      const buildResult = await transactionService.buildBatchTransaction({
        transactions: batchTransactions.map(tx => ({
          recipientAddress: tx.recipientAddress,
          amount: Math.round(tx.amount * 100000000),
        })),
        feeRate: feeRateInteger,
        utxos: confirmedUtxos,
        changeAddress,
        coinSelectionAlgorithm,
        avoidAddressReuse,
        consolidateSmallUtxos,
        enableRBF,
      })

      console.log('[SendOnChain] Signing batch transaction...')
      const signResult = await transactionService.signTransaction({
        transaction: buildResult.transaction,
        inputs: buildResult.inputs,
      })

      console.log('[SendOnChain] Sending batch transaction...')
      const sendResult = await transactionService.sendTransaction({
        signedTransaction: signResult.signedTransaction,
        txHex: signResult.txHex,
      })

      if (sendResult.success) {
        console.log('[SendOnChain] Batch transaction sent successfully...')

        // Save each transaction in batch
        for (const tx of batchTransactions) {
          await transactionService.savePendingTransaction({
            txid: sendResult.txid!,
            recipientAddress: tx.recipientAddress,
            amount: Math.round(tx.amount * 100000000),
            fee: Math.round(buildResult.fee / batchTransactions.length), // Distribute fee evenly
            txHex: signResult.txHex,
            memo: tx.memo,
          })
        }

        setSubmitting(false)
        Alert.alert(
          'Batch Transaction Sent',
          `Batch transaction successfully sent!\n\nTXID: ${sendResult.txid}\nRecipients: ${batchTransactions.length}\nTotal Amount: ${batchTransactions.reduce((sum, tx) => sum + tx.amount, 0).toFixed(8)} BTC\nTotal Fee: ${(buildResult.fee / 100000000).toFixed(8)} BTC`,
          [
            {
              text: 'OK',
              onPress: () => {
                setBatchTransactions([])
                setIsBatchMode(false)
                router.back()
              },
            },
          ],
        )
      } else {
        console.log('[SendOnChain] Failed to send batch transaction:', sendResult.error)
        Alert.alert('Error', `Failed to send batch transaction: ${sendResult.error}`)
        setSubmitting(false)
      }
    } catch (error) {
      console.log('[SendOnChain] Batch transaction failed:', error)
      Alert.alert('Error', `Batch transaction failed: ${(error as Error).message}`)
      setSubmitting(false)
    }
  }

  async function handleSend() {
    if (isBatchMode) {
      await handleSendBatch()
      return
    }

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

      const changeAddress = addressService.getNextChangeAddress()

      const feeRateInteger = Math.round(feeRate)
      console.log('[SendOnChain] feeRate (sat/vB)', feeRateInteger)

      const buildResult = await transactionService.buildTransaction({
        recipientAddress,
        amount: amountInSatoshis,
        feeRate: feeRateInteger,
        utxos: confirmedUtxos,
        changeAddress,
        coinSelectionAlgorithm,
        avoidAddressReuse,
        consolidateSmallUtxos,
        enableRBF,
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
          memo,
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

      <AdvancedFeeEstimation
        selectedFeeRate={selectedFeeRate}
        onFeeRateChange={setSelectedFeeRate}
      />

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

      <View style={styles.section}>
        <View style={styles.batchToggleContainer}>
          <Text style={[styles.label, isDark && styles.labelDark]}>Batch Mode</Text>
          <Switch
            value={isBatchMode}
            onValueChange={setIsBatchMode}
            trackColor={{ false: '#767577', true: colors.primary }}
            thumbColor={isBatchMode ? colors.white : '#f4f3f4'}
          />
        </View>
        <Text style={[styles.batchInfo, isDark && styles.batchInfoDark]}>
          {isBatchMode
            ? 'Add multiple recipients to send in a single transaction'
            : 'Send to a single recipient'}
        </Text>

        {isBatchMode && (
          <>
            <Pressable
              onPress={addToBatch}
              disabled={
                !recipientAddress.trim() ||
                addressValid !== true ||
                amount <= 0 ||
                amountValid !== true
              }
              style={[
                styles.button,
                styles.secondaryButton,
                (!recipientAddress.trim() ||
                  addressValid !== true ||
                  amount <= 0 ||
                  amountValid !== true) &&
                  styles.disabledButton,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Add to Batch</Text>
            </Pressable>

            {batchTransactions.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.label, isDark && styles.labelDark]}>
                  Batch Transactions ({batchTransactions.length})
                </Text>
                {batchTransactions.map((tx, index) => (
                  <View key={tx.id} style={[styles.batchItem, isDark && styles.batchItemDark]}>
                    <View style={styles.batchItemContent}>
                      <Text
                        style={[styles.batchItemAddress, isDark && styles.batchItemAddressDark]}
                      >
                        {index + 1}. {tx.recipientAddress}
                      </Text>
                      <Text style={[styles.batchItemAmount, isDark && styles.batchItemAmountDark]}>
                        {tx.amount.toFixed(8)} BTC
                      </Text>
                      {tx.memo && (
                        <Text style={[styles.batchItemMemo, isDark && styles.batchItemMemoDark]}>
                          {tx.memo}
                        </Text>
                      )}
                    </View>
                    <Pressable onPress={() => removeFromBatch(tx.id)} style={styles.removeButton}>
                      <IconSymbol name="minus.circle.fill" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                ))}
                <Text style={[styles.batchTotal, isDark && styles.batchTotalDark]}>
                  Total: {batchTransactions.reduce((sum, tx) => sum + tx.amount, 0).toFixed(8)} BTC
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      <CoinSelectionOptions
        selectedAlgorithm={coinSelectionAlgorithm}
        onAlgorithmChange={setCoinSelectionAlgorithm}
        avoidAddressReuse={avoidAddressReuse}
        onAvoidAddressReuseChange={setAvoidAddressReuse}
        consolidateSmallUtxos={consolidateSmallUtxos}
        onConsolidateSmallUtxosChange={setConsolidateSmallUtxos}
      />

      <AdvancedTransactionOptions
        enableRBF={enableRBF}
        onEnableRBFChange={setEnableRBF}
        selectedSighashType={sighashType}
        onSighashTypeChange={setSighashType}
        enableCPFP={enableCPFP}
        onEnableCPFPChange={setEnableCPFP}
        cpfpTargetFeeRate={cpfpTargetFeeRate}
        onCpfpTargetFeeRateChange={setCpfpTargetFeeRate}
      />

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
  batchToggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  batchInfo: {
    fontSize: 12,
    color: colors.textSecondary.light,
    marginTop: 4,
  },
  batchInfoDark: {
    color: colors.textSecondary.dark,
  },
  secondaryButton: {
    backgroundColor: alpha(colors.primary, 0.1),
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
  },
  batchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginVertical: 4,
    backgroundColor: alpha(colors.black, 0.05),
    borderRadius: 8,
  },
  batchItemDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  batchItemContent: {
    flex: 1,
  },
  batchItemAddress: {
    fontSize: 14,
    color: colors.text.light,
    fontWeight: '500',
  },
  batchItemAddressDark: {
    color: colors.text.dark,
  },
  batchItemAmount: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
    marginTop: 2,
  },
  batchItemAmountDark: {
    color: colors.primary,
  },
  batchItemMemo: {
    fontSize: 12,
    color: colors.textSecondary.light,
    marginTop: 2,
  },
  batchItemMemoDark: {
    color: colors.textSecondary.dark,
  },
  removeButton: {
    padding: 4,
  },
  batchTotal: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.light,
    textAlign: 'right',
    marginTop: 8,
  },
  batchTotalDark: {
    color: colors.text.dark,
  },
})
