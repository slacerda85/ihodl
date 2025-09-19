import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/icon-symbol'
import { useRouter } from 'expo-router'
import { fromBech32, fromBase58check } from '@/lib/address'
import useStorage from '@/features/storage/useStorage'
import {
  fromMnemonic,
  createRootExtendedKey,
  deriveChildPrivateKey,
  createPublicKey,
  createHardenedIndex,
  splitRootExtendedKey,
} from '@/lib/key'
import { buildTransaction, signTransaction, sendTransaction } from '@/lib/transactions'
import { formatBalance } from './utils'
import { UTXO } from '@/lib/utxo'
import { createSegwitAddress } from '@/lib/address'

export default function Send() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const router = useRouter()

  const activeWalletId = useStorage(state => state.activeWalletId)
  const wallets = useStorage(state => state.wallets)
  const walletCaches = useStorage(state => state.tx.walletCaches)
  const getBalance = useStorage(state => state.tx.getBalance)
  const getUtxos = useStorage(state => state.tx.getUtxos)
  const unit = useStorage(state => state.unit)

  const [submitting, setSubmitting] = useState<boolean>(false)

  const [recipientAddress, setRecipientAddress] = useState<string>('')
  const [amountInput, setAmountInput] = useState<string>('')
  const [amount, setAmount] = useState<number>(0)
  const [feeRateInput, setFeeRateInput] = useState<string>('1')
  const [feeRate, setFeeRate] = useState<number>(1) // Default fee rate in sat/vB
  const [memo, setMemo] = useState<string>('')
  const [autoFeeAdjustment, setAutoFeeAdjustment] = useState<boolean>(true)
  const [addressValid, setAddressValid] = useState<boolean | null>(null)
  const [amountValid, setAmountValid] = useState<boolean | null>(null)

  // Check if we have cached data for the active wallet
  const hasTransactionData = activeWalletId
    ? walletCaches.some(cache => cache.walletId === activeWalletId)
    : false

  // Usar o novo método para obter saldo com verificação de segurança
  const availableBalance =
    activeWalletId && getBalance && typeof getBalance === 'function' && hasTransactionData
      ? getBalance(activeWalletId)
      : 0

  // Function to derive change address
  const deriveChangeAddress = (
    extendedKey: Uint8Array,
    purpose: number,
    coinType: number,
    accountIndex: number,
    addressIndex: number = 0,
  ): string => {
    try {
      // Derive purpose (hardened)
      const purposeIndex = createHardenedIndex(purpose)
      const purposeExtendedKey = deriveChildPrivateKey(extendedKey, purposeIndex)

      // Derive coin type (hardened)
      const coinTypeIndex = createHardenedIndex(coinType)
      const coinTypeExtendedKey = deriveChildPrivateKey(purposeExtendedKey, coinTypeIndex)

      // Derive account (hardened)
      const accountIndexHardened = createHardenedIndex(accountIndex)
      const accountExtendedKey = deriveChildPrivateKey(coinTypeExtendedKey, accountIndexHardened)

      // Derive change (non-hardened, change = 1)
      const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, 1)

      // Derive address index (non-hardened)
      const addressIndexExtendedKey = deriveChildPrivateKey(changeExtendedKey, addressIndex)

      // Get private key and create public key
      const { privateKey } = splitRootExtendedKey(addressIndexExtendedKey)
      const publicKey = createPublicKey(privateKey)

      // Create SegWit address
      return createSegwitAddress(publicKey)
    } catch (error) {
      console.error('Error deriving change address:', error)
      throw new Error('Failed to derive change address')
    }
  }

  // Bitcoin address validation function
  const validateBitcoinAddress = (address: string): boolean => {
    if (!address || address.trim().length === 0) {
      return false
    }

    const trimmedAddress = address.trim()

    // Check if it's a Bech32 address (starts with bc1)
    if (trimmedAddress.startsWith('bc1')) {
      try {
        fromBech32(trimmedAddress)
        return true
      } catch {
        return false
      }
    }

    // Check if it's a Base58 address (starts with 1 or 3)
    if (trimmedAddress.startsWith('1') || trimmedAddress.startsWith('3')) {
      try {
        fromBase58check(trimmedAddress)
        return true
      } catch {
        return false
      }
    }

    return false
  }

  // Effect to validate address when it changes
  useEffect(() => {
    if (recipientAddress.trim()) {
      const isValid = validateBitcoinAddress(recipientAddress)
      setAddressValid(isValid)
    } else {
      setAddressValid(null)
    }
  }, [recipientAddress])

  // Effect to validate amount when feeRate, availableBalance, or amount changes
  useEffect(() => {
    if (amount > 0) {
      if (amount + (feeRate * 250) / 100000000 > availableBalance) {
        setAmountValid(false)
      } else {
        setAmountValid(true)
      }
    } else {
      setAmountValid(null)
    }
  }, [feeRate, availableBalance, amount])

  useEffect(() => {
    const normalized = normalizeAmount(amountInput)
    const num = parseFloat(normalized)
    setAmount(isNaN(num) ? 0 : num)
  }, [amountInput])

  useEffect(() => {
    const num = parseFloat(feeRateInput)
    setFeeRate(isNaN(num) ? 1 : num)
  }, [feeRateInput])

  // Function to normalize amount input (convert commas to dots)
  const normalizeAmount = (text: string): string => {
    // Replace commas with dots for decimal separator
    return text.replace(/,/g, '.')
  }

  // Function to handle amount input changes
  const handleAmountChange = (text: string) => {
    // Normalize the input and update state
    const normalizedText = normalizeAmount(text)
    setAmountInput(normalizedText)
  }

  async function handleSend() {
    if (!recipientAddress.trim()) {
      Alert.alert('Error', 'Please enter a recipient address')
      return
    }

    if (addressValid === false) {
      Alert.alert('Error', 'Please enter a valid Bitcoin address')
      return
    }

    if (amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount')
      return
    }

    if (feeRate <= 0) {
      Alert.alert('Error', 'Please enter a valid fee rate')
      return
    }

    if (!activeWalletId) {
      Alert.alert('Error', 'No active wallet found')
      return
    }

    const activeWallet = wallets.find(wallet => wallet.walletId === activeWalletId)
    if (!activeWallet) {
      Alert.alert('Error', 'Active wallet not found')
      return
    }

    console.log('Starting transaction assembly...')
    setSubmitting(true)

    try {
      console.log('Retrieving wallet data...')
      // Get wallet data
      const entropy = fromMnemonic(activeWallet.seedPhrase)
      const extendedKey = createRootExtendedKey(entropy)

      console.log('Retrieving UTXOs...')
      // Get UTXOs and convert to UTXO format
      const allUtxos = getUtxos ? getUtxos(activeWalletId) : []
      const utxos = allUtxos.filter((utxo: UTXO) => !utxo.isSpent)

      console.log('Deriving change address...')
      // Get change address using proper derivation
      const account = activeWallet.accounts[0]
      const changeAddress = deriveChangeAddress(
        extendedKey,
        account.purpose,
        account.coinType,
        account.accountIndex,
        0, // Use address index 0 for change
      )

      console.log('Building transaction...')
      console.log('amount', amount)
      // Build transaction
      const buildResult = await buildTransaction({
        recipientAddress,
        amount,
        feeRate,
        utxos,
        changeAddress,
        extendedKey,
        purpose: account.purpose,
        coinType: account.coinType,
        accountIndex: account.accountIndex,
      })

      console.log('Signing transaction...')
      // Sign transaction
      const signResult = await signTransaction({
        transaction: buildResult.transaction,
        inputs: buildResult.inputs,
        extendedKey,
        purpose: account.purpose,
        coinType: account.coinType,
        accountIndex: account.accountIndex,
      })

      console.log('Sending transaction...')
      // Send transaction
      const sendResult = await sendTransaction({
        signedTransaction: signResult.signedTransaction,
        txHex: signResult.txHex,
      })

      if (sendResult.success) {
        console.log('Transaction sent successfully...')
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
        console.log('Failed to send transaction:', sendResult.error)
        Alert.alert('Error', `Failed to send transaction: ${sendResult.error}`)
        setSubmitting(false)
      }
    } catch (error) {
      console.log('Transaction failed:', error)
      Alert.alert('Error', `Transaction failed: ${(error as Error).message}`)
      setSubmitting(false)
    }
  }

  return (
    <ScrollView style={[styles.scrollView, isDark && styles.scrollViewDark]}>
      <View style={[styles.container, isDark && styles.containerDark]}>
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
              {formatBalance(availableBalance - (amount + (feeRate * 250) / 100000000), unit)}{' '}
              {unit}
            </Text>
          )}
          {amountValid === true && <Text style={styles.validText}>✓ Sufficient balance</Text>}
          <View style={styles.balanceContainer}>
            <Text style={[styles.balanceText, isDark && styles.balanceTextDark]}>
              Available: {formatBalance(availableBalance, unit)} {unit}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.feeHeader}>
            <Text style={[styles.label, isDark && styles.labelDark]}>Fee Rate (sat/vB)</Text>
            <View style={styles.autoFeeContainer}>
              <Text style={[styles.autoFeeLabel, isDark && styles.autoFeeLabelDark]}>
                Auto-adjust
              </Text>
              <Switch
                value={autoFeeAdjustment}
                onValueChange={setAutoFeeAdjustment}
                trackColor={{ false: '#767577', true: colors.primary }}
                thumbColor={autoFeeAdjustment ? colors.white : '#f4f3f4'}
              />
            </View>
          </View>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            placeholder="1"
            placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            value={feeRateInput}
            onChangeText={setFeeRateInput}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!autoFeeAdjustment}
          />
          <View style={styles.infoBox}>
            <IconSymbol
              name="info.circle.fill"
              size={16}
              style={styles.infoIcon}
              color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            />
            <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
              {autoFeeAdjustment
                ? 'Fee rate is automatically adjusted based on network conditions.'
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
    padding: 16,
    marginBottom: 24,
    gap: 24,
  },
  containerDark: {
    // No additional styles needed
  },
  section: {
    marginBottom: 0,
  },
  label: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 8,
  },
  labelDark: {
    color: colors.text.dark,
  },
  input: {
    padding: 16,
    height: 48,
    borderRadius: 16,
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
    borderColor: '#44ff44',
  },
  errorText: {
    fontSize: 14,
    color: '#ff4444',
    marginTop: 4,
  },
  validText: {
    fontSize: 14,
    color: '#44ff44',
    marginTop: 4,
  },
  feeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  autoFeeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoFeeLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  autoFeeLabelDark: {
    color: colors.textSecondary.dark,
  },
  infoBox: {
    marginTop: 8,
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
    color: colors.textSecondary.light,
  },
  infoTextDark: {
    color: colors.textSecondary.dark,
  },
  button: {
    padding: 16,
    borderRadius: 16,
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
})
