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
    const availableTxids = cachedTransactions
      .flatMap(cache => cache.transactions.map(tx => tx.txid))
      .join(', ')
    return (
      <ContentContainer>
        <View style={styles.container}>
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>
            Transaction not found
          </Text>
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>TXID: {txid}</Text>
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>
            Available transactions: {availableTxids}
          </Text>
        </View>
      </ContentContainer>
    )
  }

  const { tx } = transaction

  // Calculate basic info using UIFriendlyTransaction fields
  const amount = tx.amount

  // Format date from UIFriendlyTransaction
  const date = new Date(tx.date).toLocaleString()

  // Status and confirmations from UIFriendlyTransaction
  const confirmations = tx.confirmations || 0
  const status =
    tx.status === 'confirmed'
      ? 'Confirmed'
      : tx.status === 'pending'
        ? 'Pending'
        : tx.status === 'processing'
          ? 'Processing'
          : 'Unknown'

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
              <Text
                style={[
                  styles.amount,
                  isDark && styles.amountDark,
                  tx.type === 'received' ? styles.amountPositive : styles.amountNegative,
                ]}
              >
                {tx.type === 'received' ? '+' : '-'}
                {amount.toFixed(8)} BTC
              </Text>
            </View>

            {/* Type */}
            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Type</Text>
              <Text style={[styles.value, isDark && styles.valueDark]}>
                {tx.type === 'received'
                  ? 'Received'
                  : tx.type === 'sent'
                    ? 'Sent'
                    : 'Self Transfer'}
              </Text>
            </View>

            {/* From Address */}
            {tx.fromAddress && tx.fromAddress.trim() !== '' && (
              <View style={styles.item}>
                <Text style={[styles.label, isDark && styles.labelDark]}>
                  {tx.type === 'received' ? 'From' : 'Sender'}
                </Text>
                <Text style={[styles.address, isDark && styles.addressDark]}>{tx.fromAddress}</Text>
              </View>
            )}

            {/* To Address */}
            {tx.toAddress && tx.toAddress.trim() !== '' && (
              <View style={styles.item}>
                <Text style={[styles.label, isDark && styles.labelDark]}>
                  {tx.type === 'sent' ? 'To' : 'Recipient'}
                </Text>
                <Text style={[styles.address, isDark && styles.addressDark]}>{tx.toAddress}</Text>
              </View>
            )}

            {/* Fee */}
            {tx.fee && tx.fee > 0 && (
              <View style={styles.item}>
                <Text style={[styles.label, isDark && styles.labelDark]}>Fee</Text>
                <Text style={[styles.value, isDark && styles.valueDark]}>
                  {(tx.fee / 1e8).toFixed(8)} BTC
                </Text>
              </View>
            )}

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
    color: colors.primary,
  },
  amountNegative: {
    color: colors.textSecondary.light,
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
