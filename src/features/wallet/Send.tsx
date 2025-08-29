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

export default function Send() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const router = useRouter()
  const [submitting, setSubmitting] = useState<boolean>(false)

  const [recipientAddress, setRecipientAddress] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [feeRate, setFeeRate] = useState<string>('1') // Default fee rate in sat/vB
  const [memo, setMemo] = useState<string>('')
  const [autoFeeAdjustment, setAutoFeeAdjustment] = useState<boolean>(true)
  const [addressValid, setAddressValid] = useState<boolean | null>(null)

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

  // Auto-adjust fee rate function
  const getRecommendedFeeRate = async (): Promise<number> => {
    // This is a placeholder - in a real implementation, you would:
    // 1. Connect to Electrum server
    // 2. Get fee estimates using blockchain.estimatefee
    // 3. Return appropriate fee rate based on urgency

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500))

    // Return a mock recommended fee rate (in sat/vB)
    // In reality, this would be based on network conditions
    return Math.floor(Math.random() * 20) + 5 // Random between 5-25 sat/vB
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

  // Function to normalize amount input (convert commas to dots)
  const normalizeAmount = (text: string): string => {
    // Replace commas with dots for decimal separator
    return text.replace(/,/g, '.')
  }

  // Function to handle amount input changes
  const handleAmountChange = (text: string) => {
    // Normalize the input and update state
    const normalizedText = normalizeAmount(text)
    setAmount(normalizedText)
  }

  function handleSend() {
    if (!recipientAddress.trim()) {
      Alert.alert('Error', 'Please enter a recipient address')
      return
    }

    if (addressValid === false) {
      Alert.alert('Error', 'Please enter a valid Bitcoin address')
      return
    }

    if (!amount.trim() || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount')
      return
    }

    if (!feeRate.trim() || parseFloat(feeRate) <= 0) {
      Alert.alert('Error', 'Please enter a valid fee rate')
      return
    }

    setSubmitting(true)

    // TODO: Implement actual transaction creation and broadcasting
    // This is a placeholder for the send functionality
    setTimeout(() => {
      Alert.alert(
        'Transaction Sent',
        `Sending ${amount} BTC to ${recipientAddress}\nFee Rate: ${feeRate} sat/vB\n\nThis is a placeholder. Transaction broadcasting will be implemented.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setSubmitting(false)
              router.back()
            },
          },
        ],
      )
    }, 2000)
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
            style={[styles.input, isDark && styles.inputDark]}
            placeholder="0.00000000"
            placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            value={amount}
            onChangeText={handleAmountChange}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />
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
            value={feeRate}
            onChangeText={setFeeRate}
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
          disabled={submitting}
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
})
