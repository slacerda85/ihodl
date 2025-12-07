import React from 'react'
import { View, Text, ScrollView, StyleSheet, Alert, Share, TouchableOpacity } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useIsDark, useAddresses, useBalance } from '@/ui/features/app-provider'
import QRCode from '@/ui/components/QRCode'
import ContentContainer from '@/ui/components/ContentContainer'
import { transactionService, networkService, addressService } from '@/core/services'
import { formatBalance } from '../wallet/utils'

export default function TransactionDetails() {
  const { txid } = useLocalSearchParams<{ txid: string }>()
  const isDark = useIsDark()
  const addresses = useAddresses()
  const { utxos } = useBalance()

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

  const handleRBF = async () => {
    Alert.alert(
      'Replace-By-Fee',
      'This will create a new transaction with higher fees to replace the current one. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            try {
              const connection = await networkService.connect()
              const originalTx = await transactionService.getTransaction(tx.txid, connection)
              if (!originalTx) {
                Alert.alert('Error', 'Could not fetch transaction details')
                return
              }

              if (!transactionService.canBumpFee(originalTx.hex)) {
                Alert.alert('Error', 'This transaction cannot be replaced (not RBF enabled)')
                return
              }

              // Get change address
              const changeAddress = addressService.getNextChangeAddress()

              // Use higher fee rate (double the current estimated rate)
              const newFeeRate = 10 // TODO: Get current fee rate or ask user

              const amountInSatoshis = Math.round(tx.amount * 100000000)

              const bumpResult = await transactionService.bumpRBFFee({
                originalTxHex: originalTx.hex,
                newFeeRate,
                utxos,
                changeAddress,
                recipientAddress: tx.toAddress,
                amount: amountInSatoshis,
              })

              // TODO: Sign and send the replacement transaction
              Alert.alert(
                'RBF',
                `Replacement transaction created: ${bumpResult.replacementTransaction.txid}`,
              )
            } catch (error) {
              Alert.alert('Error', `Failed to replace transaction: ${(error as Error).message}`)
            }
          },
        },
      ],
    )
  }

  const handleCPFP = async () => {
    Alert.alert(
      'Child Pays For Parent',
      'This will create a child transaction to accelerate the parent transaction. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            try {
              const connection = await networkService.connect()
              const parentTx = await transactionService.getTransaction(tx.txid, connection)
              if (!parentTx) {
                Alert.alert('Error', 'Could not fetch transaction details')
                return
              }

              if (!transactionService.canUseCPFP(parentTx.hex, utxos)) {
                Alert.alert('Error', 'CPFP cannot be used for this transaction')
                return
              }

              const changeAddress = addressService.getNextChangeAddress()
              const targetFeeRate = 20 // TODO: Ask user or use higher rate

              const cpfpResult = await transactionService.suggestCPFP({
                parentTxHex: parentTx.hex,
                targetFeeRate,
                utxos,
                changeAddress,
              })

              // TODO: Sign and send the CPFP transaction
              Alert.alert(
                'CPFP',
                `CPFP transaction suggested with effective fee rate: ${cpfpResult.effectiveFeeRate} sat/vB`,
              )
            } catch (error) {
              Alert.alert('Error', `Failed to create CPFP transaction: ${(error as Error).message}`)
            }
          },
        },
      ],
    )
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

          {/* Actions for pending transactions */}
          {confirmations === 0 && (
            <View style={styles.actionsSection}>
              <Text style={[styles.actionsTitle, isDark && styles.actionsTitleDark]}>
                Transaction Actions
              </Text>
              <Text style={[styles.actionsSubtitle, isDark && styles.actionsSubtitleDark]}>
                Speed up your transaction with higher fees
              </Text>

              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rbfButton]}
                  onPress={handleRBF}
                >
                  <IconSymbol name="arrow.up.circle" size={20} color={colors.white} />
                  <Text style={styles.actionButtonText}>Replace-By-Fee</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.cpfpButton]}
                  onPress={handleCPFP}
                >
                  <IconSymbol name="arrow.right.circle" size={20} color={colors.white} />
                  <Text style={styles.actionButtonText}>Child Pays For Parent</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  actionsSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: alpha(colors.warning, 0.1),
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.light,
    marginBottom: 4,
  },
  actionsTitleDark: {
    color: colors.text.dark,
  },
  actionsSubtitle: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginBottom: 16,
  },
  actionsSubtitleDark: {
    color: colors.textSecondary.dark,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  rbfButton: {
    backgroundColor: colors.primary,
  },
  cpfpButton: {
    backgroundColor: colors.secondary,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
})
