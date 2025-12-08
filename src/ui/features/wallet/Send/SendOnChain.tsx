import { useCallback, useMemo } from 'react'
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
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useIsDark, useBalance } from '@/ui/features/app-provider'
import { formatBalance } from '../utils'
import { addressService } from '@/core/services'
import CoinSelectionOptions from './CoinSelectionOptions'
import AdvancedTransactionOptions from './AdvancedTransactionOptions'
import AdvancedFeeEstimation from './AdvancedFeeEstimation'
import {
  useSendOnChainState,
  useFeeRates,
  useBatchTransactions,
  useSendOnChainActions,
} from './SendOnChain/index'

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
  const isDark = useIsDark()
  const { balance } = useBalance()

  // Hooks customizados para gerenciar estado e lógica
  const state = useSendOnChainState()
  const { selectedFeeRate, feeRate, setSelectedFeeRate } = useFeeRates()
  const { batchTransactions, addToBatch, removeFromBatch, totalBatchAmount, batchCount } =
    useBatchTransactions()
  const { sendTransaction, sendBatchTransactions } = useSendOnChainActions()

  // Validação de endereço derivada via useMemo (não causa re-render extra)
  const addressValid = useMemo(() => {
    if (!state.recipientAddress.trim()) return null
    return addressService.validateAddress(state.recipientAddress)
  }, [state.recipientAddress])

  // Validação de amount derivada via useMemo
  const amountValid = useMemo(() => {
    if (state.amount <= 0) return null

    const amountInSatoshis = Math.round(state.amount * 100000000)
    const feeRateInteger = Math.round(feeRate)
    const estimatedTxSize = 250
    const estimatedFeeInSatoshis = Math.round(feeRateInteger * estimatedTxSize)
    const balanceInSatoshis = Math.round(balance * 100000000)

    return amountInSatoshis + estimatedFeeInSatoshis <= balanceInSatoshis
  }, [feeRate, state.amount, balance])

  // Function to normalize amount input (convert commas to dots)
  const normalizeAmount = (text: string): string => {
    return text.replace(/,/g, '.')
  }

  // Function to handle amount input changes
  const handleAmountChange = (text: string) => {
    const normalizedText = normalizeAmount(text)
    state.setAmountInput(normalizedText)
    const num = parseFloat(normalizedText)
    state.setAmount(isNaN(num) ? 0 : num)
  }

  // Function to add transaction to batch
  const handleAddToBatch = useCallback(() => {
    if (
      !state.recipientAddress.trim() ||
      addressValid !== true ||
      state.amount <= 0 ||
      amountValid !== true
    ) {
      Alert.alert(
        'Error',
        'Please fill in valid recipient address and amount before adding to batch',
      )
      return
    }

    addToBatch({
      recipient: state.recipientAddress,
      amount: state.amount,
      feeRate,
    })

    // Clear current inputs
    state.setRecipientAddress('')
    state.setAmountInput('')
    state.setAmount(0)
    state.setMemo('')
  }, [state, addressValid, amountValid, feeRate, addToBatch])

  async function handleSend() {
    if (state.isBatchMode) {
      await sendBatchTransactions()
    } else {
      await sendTransaction()
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
          value={state.recipientAddress}
          onChangeText={state.setRecipientAddress}
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
          value={state.amountInput}
          onChangeText={handleAmountChange}
          keyboardType="decimal-pad"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {amountValid === false && state.amount <= 0 && (
          <Text style={styles.errorText}>Amount must be greater than 0</Text>
        )}
        {amountValid === false && state.amount > 0 && (
          <Text style={styles.errorText}>
            Insufficient balance including estimated fees. Remaining:{' '}
            {formatBalance(
              Math.max(0, balance - state.amount - (Math.round(feeRate) * 250) / 100000000),
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
          value={state.memo}
          onChangeText={state.setMemo}
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.batchToggleContainer}>
          <Text style={[styles.label, isDark && styles.labelDark]}>Batch Mode</Text>
          <Switch
            value={state.isBatchMode}
            onValueChange={state.setIsBatchMode}
            trackColor={{ false: '#767577', true: colors.primary }}
            thumbColor={state.isBatchMode ? colors.white : '#f4f3f4'}
          />
        </View>
        <Text style={[styles.batchInfo, isDark && styles.batchInfoDark]}>
          {state.isBatchMode
            ? 'Add multiple recipients to send in a single transaction'
            : 'Send to a single recipient'}
        </Text>

        {state.isBatchMode && (
          <>
            <Pressable
              onPress={handleAddToBatch}
              disabled={
                !state.recipientAddress.trim() ||
                addressValid !== true ||
                state.amount <= 0 ||
                amountValid !== true
              }
              style={[
                styles.button,
                styles.secondaryButton,
                (!state.recipientAddress.trim() ||
                  addressValid !== true ||
                  state.amount <= 0 ||
                  amountValid !== true) &&
                  styles.disabledButton,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Add to Batch</Text>
            </Pressable>

            {batchCount > 0 && (
              <View style={styles.section}>
                <Text style={[styles.label, isDark && styles.labelDark]}>
                  Batch Transactions ({batchCount})
                </Text>
                {batchTransactions.map((tx, index) => (
                  <View key={tx.id} style={[styles.batchItem, isDark && styles.batchItemDark]}>
                    <View style={styles.batchItemContent}>
                      <Text
                        style={[styles.batchItemAddress, isDark && styles.batchItemAddressDark]}
                      >
                        {index + 1}. {tx.recipient}
                      </Text>
                      <Text style={[styles.batchItemAmount, isDark && styles.batchItemAmountDark]}>
                        {tx.amount.toFixed(8)} BTC
                      </Text>
                    </View>
                    <Pressable onPress={() => removeFromBatch(tx.id)} style={styles.removeButton}>
                      <IconSymbol name="minus.circle.fill" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                ))}
                <Text style={[styles.batchTotal, isDark && styles.batchTotalDark]}>
                  Total: {totalBatchAmount.toFixed(8)} BTC
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      <CoinSelectionOptions
        selectedAlgorithm={state.coinSelectionAlgorithm}
        onAlgorithmChange={state.setCoinSelectionAlgorithm}
        avoidAddressReuse={state.avoidAddressReuse}
        onAvoidAddressReuseChange={state.setAvoidAddressReuse}
        consolidateSmallUtxos={state.consolidateSmallUtxos}
        onConsolidateSmallUtxosChange={state.setConsolidateSmallUtxos}
      />

      <AdvancedTransactionOptions
        enableRBF={state.enableRBF}
        onEnableRBFChange={state.setEnableRBF}
        selectedSighashType={state.sighashType}
        onSighashTypeChange={state.setSighashType}
        enableCPFP={state.enableCPFP}
        onEnableCPFPChange={state.setEnableCPFP}
        cpfpTargetFeeRate={state.cpfpTargetFeeRate}
        onCpfpTargetFeeRateChange={state.setCpfpTargetFeeRate}
      />

      <Pressable
        onPress={handleSend}
        disabled={state.submitting || amountValid === false}
        style={[styles.button, styles.primaryButton, state.submitting && styles.disabledButton]}
      >
        {state.submitting ? <ActivityIndicator color={colors.white} /> : null}
        <Text style={styles.buttonText}>{state.submitting ? 'Sending...' : 'Send Bitcoin'}</Text>
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
