import React from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  useColorScheme,
  Alert,
  Share,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import IconSymbol from '@/ui/IconSymbol'
import { useTransactions } from '../store'
import QRCode from '@/ui/QRCode'
import ContentContainer from '@/ui/ContentContainer'

export default function TransactionDetails() {
  const { txid } = useLocalSearchParams<{ txid: string }>()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const { cachedTransactions } = useTransactions()

  // Find the transaction in caches
  const transaction = cachedTransactions
    .flatMap(cache => cache.transactions.map(tx => ({ tx, walletId: cache.walletId })))
    .find(item => item.tx.txid === txid)

  if (!transaction) {
    return (
      <ContentContainer>
        <View style={[styles.container, isDark && styles.containerDark]}>
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>
            Transaction not found
          </Text>
        </View>
      </ContentContainer>
    )
  }

  const { tx } = transaction

  // Calculate basic info
  const totalOutput = tx.vout?.reduce((sum, vout) => sum + (vout.value || 0), 0) || 0

  // Format date
  const date = tx.blocktime ? new Date(tx.blocktime * 1000).toLocaleString() : 'Pending'

  // Status
  const confirmations = tx.confirmations || 0
  const status = confirmations > 0 ? 'Confirmed' : 'Pending'

  // For addresses, we'll show input/output counts since detailed addresses may not be available
  const inputCount = tx.vin?.length || 0
  const outputCount = tx.vout?.length || 0

  const handleCopyTxid = async () => {
    try {
      await Clipboard.setStringAsync(tx.txid)
      Alert.alert('Copied!', 'Transaction ID copied to clipboard')
    } catch {
      Alert.alert('Error', 'Failed to copy transaction ID')
    }
  }

  const handleShareTxid = async () => {
    try {
      await Share.share({
        message: `Bitcoin Transaction: ${tx.txid}`,
        url: `https://mempool.space/tx/${tx.txid}`,
      })
    } catch (error) {
      console.error('Error sharing transaction:', error)
    }
  }

  return (
    <ContentContainer>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={[styles.container, isDark && styles.containerDark]}>
          {/* Main Section */}
          <View style={[styles.section, isDark && styles.sectionDark]}>
            {/* Header */}
            <View style={styles.item}>
              <Text style={[styles.title, isDark && styles.titleDark]}>Transaction Details</Text>
              <Text style={[styles.status, confirmations > 0 ? styles.confirmed : styles.pending]}>
                {status}
              </Text>
            </View>

            {/* TXID */}
            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Transaction ID</Text>
              <Text style={[styles.txid, isDark && styles.txidDark]}>{tx.txid}</Text>
              <View style={styles.buttonRow}>
                <Pressable
                  style={[
                    styles.button,
                    styles.secondaryButton,
                    isDark && styles.secondaryButtonDark,
                  ]}
                  onPress={handleCopyTxid}
                >
                  <IconSymbol name="doc.on.doc" size={16} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>Copy</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.button,
                    styles.secondaryButton,
                    isDark && styles.secondaryButtonDark,
                  ]}
                  onPress={handleShareTxid}
                >
                  <IconSymbol name="square.and.arrow.up" size={16} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>Share</Text>
                </Pressable>
              </View>
            </View>

            {/* QR Code */}
            <View style={styles.item}>
              <View style={styles.qrContainer}>
                <QRCode
                  value={tx.txid}
                  size={150}
                  color={isDark ? colors.text.dark : colors.text.light}
                  backgroundColor="transparent"
                />
              </View>
            </View>

            {/* Amount */}
            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Amount</Text>
              <Text style={[styles.amount]}>{totalOutput.toFixed(8)} BTC</Text>
            </View>

            {/* Date */}
            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Date</Text>
              <Text style={[styles.value, isDark && styles.valueDark]}>{date}</Text>
            </View>

            {/* Confirmations */}
            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Confirmations</Text>
              <Text style={[styles.value, isDark && styles.valueDark]}>{confirmations}</Text>
            </View>
            {tx.size && (
              <>
                {/* Size */}
                <View style={styles.item}>
                  <Text style={[styles.label, isDark && styles.labelDark]}>Size</Text>
                  <Text style={[styles.value, isDark && styles.valueDark]}>{tx.size} bytes</Text>
                </View>
              </>
            )}

            {/* Inputs/Outputs */}
            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Inputs</Text>
              <Text style={[styles.value, isDark && styles.valueDark]}>{inputCount}</Text>
            </View>
            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Outputs</Text>
              <Text style={[styles.value, isDark && styles.valueDark]}>{outputCount}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </ContentContainer>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    padding: 16,
    gap: 16,
  },
  containerDark: {
    // No additional styles
  },
  section: {
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 12,
    gap: 24,
  },
  sectionDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  item: {
    // No specific styles, just a container
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  titleDark: {
    color: colors.text.dark,
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  confirmed: {
    backgroundColor: alpha(colors.success, 0.1),
    color: colors.success,
  },
  pending: {
    backgroundColor: alpha(colors.warning, 0.1),
    color: colors.warning,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary.light,
  },
  labelDark: {
    color: colors.textSecondary.dark,
  },
  txid: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.light,
    lineHeight: 20,
  },
  txidDark: {
    color: colors.text.dark,
  },
  qrContainer: {
    alignItems: 'center',
    padding: 16,
  },
  amount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  amountPositive: {
    color: colors.success,
  },
  amountNegative: {
    color: colors.error,
  },
  value: {
    fontSize: 16,
    color: colors.text.light,
  },
  valueDark: {
    color: colors.text.dark,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonDark: {
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  address: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.text.light,
    flex: 1,
    marginRight: 8,
  },
  addressDark: {
    color: colors.text.dark,
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
