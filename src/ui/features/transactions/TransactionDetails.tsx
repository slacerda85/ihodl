import React from 'react'
import { View, Text, ScrollView, StyleSheet, Alert, Share, TouchableOpacity } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useIsDark, useAddresses } from '@/ui/features/app-provider'
import QRCode from '@/ui/components/QRCode'
import ContentContainer from '@/ui/components/ContentContainer'
import { transactionService } from '@/core/services'
import { formatBalance } from '../wallet/utils'

export default function TransactionDetails() {
  const { txid } = useLocalSearchParams<{ txid: string }>()
  const isDark = useIsDark()
  const addresses = useAddresses()

  const transactions = transactionService.getFriendlyTxs(addresses || [])

  const tx = transactions.find(t => t.txid === txid)

  if (!tx) {
    return (
      <ContentContainer>
        <View style={styles.container}>
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>
            Transaction not found
          </Text>
          <Text style={[styles.errorText, isDark && styles.errorTextDark]}>TXID: {txid}</Text>
        </View>
      </ContentContainer>
    )
  }

  const { type, amount, fromAddress, toAddress, status, fee, date, confirmations } = tx

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

            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Transaction ID</Text>
              <Text style={[styles.txid, isDark && styles.txidDark]}>{tx.txid}</Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.button} onPress={handleCopyTxid}>
                  <IconSymbol
                    name="doc.on.doc"
                    size={16}
                    color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  />
                  <Text style={styles.secondaryButtonText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button} onPress={handleShareTxid}>
                  <IconSymbol
                    name="square.and.arrow.up"
                    size={16}
                    color={colors.textSecondary[isDark ? 'dark' : 'light']}
                  />
                  <Text style={styles.secondaryButtonText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.item}>
              <View style={styles.qrContainer}>
                <QRCode
                  value={tx.txid}
                  size={300}
                  color={isDark ? colors.text.dark : colors.text.light}
                  backgroundColor="transparent"
                />
              </View>
            </View>

            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Amount</Text>
              <Text
                style={[
                  styles.amount,
                  isDark && styles.amountDark,
                  type === 'received' ? styles.amountPositive : styles.amountNegative,
                ]}
              >
                {type === 'received' ? '+' : type === 'sent' ? '-' : ''}
                {formatBalance(amount)} BTC
              </Text>
            </View>

            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Fee</Text>
              <Text style={[styles.value, isDark && styles.valueDark]}>
                {formatBalance(fee ?? undefined)} BTC
              </Text>
            </View>

            {fromAddress && (
              <View style={styles.item}>
                <Text style={[styles.label, isDark && styles.labelDark]}>
                  {type === 'received' ? 'From' : 'Sender'}
                </Text>
                <Text style={[styles.address, isDark && styles.addressDark]}>{fromAddress}</Text>
              </View>
            )}

            {toAddress && (
              <View style={styles.item}>
                <Text style={[styles.label, isDark && styles.labelDark]}>
                  {type === 'sent' ? 'To' : 'Recipient'}
                </Text>
                <Text style={[styles.address, isDark && styles.addressDark]}>{toAddress}</Text>
              </View>
            )}

            <View style={styles.item}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Date</Text>
              <Text style={[styles.value, isDark && styles.valueDark]}>{date}</Text>
            </View>

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
    fontFamily: 'ui-monospace',
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
    fontFamily: 'ui-monospace',
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
