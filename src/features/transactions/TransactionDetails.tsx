import React from 'react'
import { View, Text, ScrollView, StyleSheet, Alert, Share } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/IconSymbol/IconSymbol'
import { useTransactions } from '@/features/transactions'
import { useSettings } from '@/features/settings'
import QRCode from '@/ui/QRCode'
import ContentContainer from '@/ui/ContentContainer'
import Button from '@/ui/Button'

export default function TransactionDetails() {
  const { txid } = useLocalSearchParams<{ txid: string }>()
  const { isDark } = useSettings()

  const { state: transactionsState } = useTransactions()
  const { cachedTransactions } = transactionsState

  // Find the transaction in caches
  const transaction = cachedTransactions
    .flatMap(cache => cache.transactions.map(tx => ({ tx, walletId: cache.walletId })))
    .find(item => item.tx.txid === txid)

  if (!transaction) {
    return (
      <ContentContainer>
        <View style={styles.container}>
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
        <View style={styles.container}>
          {/* Main Section */}
          <View style={styles.section}>
            <View style={styles.item}>
              <Text
                style={[
                  styles.status,
                  confirmations > 0
                    ? isDark
                      ? styles.confirmedDark
                      : styles.confirmed
                    : isDark
                      ? styles.pendingDark
                      : styles.pending,
                ]}
              >
                {status}
              </Text>
            </View>

            {/* TXID */}
            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Transaction ID</Text>
              <Text style={[styles.txid, isDark && styles.txidDark]}>{tx.txid}</Text>
              <View style={styles.buttonRow}>
                <Button
                  style={{ flex: 1 }}
                  startIcon={
                    <IconSymbol
                      name="doc.on.doc"
                      size={16}
                      color={colors.textSecondary[isDark ? 'dark' : 'light']}
                    />
                  }
                  onPress={handleCopyTxid}
                >
                  <Text style={{ color: colors.textSecondary[isDark ? 'dark' : 'light'] }}>
                    Copy
                  </Text>
                </Button>
                <Button
                  style={{ flex: 1 }}
                  glassStyle={styles.button}
                  startIcon={
                    <IconSymbol
                      name="square.and.arrow.up"
                      size={16}
                      color={colors.textSecondary[isDark ? 'dark' : 'light']}
                    />
                  }
                  onPress={handleShareTxid}
                >
                  <Text style={{ color: colors.textSecondary[isDark ? 'dark' : 'light'] }}>
                    Share
                  </Text>
                </Button>
              </View>
            </View>

            {/* QR Code */}
            <View style={styles.item}>
              <View style={styles.qrContainer}>
                <QRCode
                  value={tx.txid}
                  size={300}
                  // fullWidth
                  color={isDark ? colors.text.dark : colors.text.light}
                  backgroundColor="transparent"
                />
              </View>
            </View>

            {/* Amount */}
            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Amount</Text>
              <Text style={[styles.amount, isDark && styles.amountDark]}>
                {totalOutput.toFixed(8)} BTC
              </Text>
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
    // gap: 16,
  },
  section: {
    // backgroundColor: colors.white,
    padding: 16,
    borderRadius: 12,
    gap: 24,
  },
  sectionDark: {
    // backgroundColor: alpha(colors.background.light, 0.1),
  },
  item: {
    gap: 8,
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
  confirmedDark: {
    backgroundColor: alpha(colors.success, 0.1),
    color: colors.success,
  },
  pending: {
    backgroundColor: alpha(colors.warning, 0.1),
    color: colors.warning,
  },
  pendingDark: {
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
    // backgroundColor: 'blue',
    width: '100%',
    alignItems: 'center',
    // padding: 16,
  },
  amount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  amountDark: {
    color: colors.text.dark,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
  },
  /* secondaryButton: {
    // backgroundColor: 'transparent',
    // borderWidth: 1,
    // borderColor: colors.primary,
  },
  secondaryButtonDark: {
    // borderColor: colors.primary,
  }, */
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
