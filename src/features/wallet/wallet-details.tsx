import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { IconSymbol } from '@/shared/ui/icon-symbol'
// import { useWallet } from './wallet-provider';
import { useRouter } from 'expo-router'

export default function WalletDetails() {
  const router = useRouter()
  // const { getBalance, sendTransaction, getAddress } = useWallet();

  // Mock data - in a real app you would get these from your wallet provider
  const [balance, setBalance] = useState<number>(1.23456789)
  const [walletName, setWalletName] = useState<string>('My Bitcoin Wallet')
  const [isOffline, setIsOffline] = useState<boolean>(false)

  function handleSend() {
    // Navigate to send screen
    // router.push('/wallet/send')
  }

  function handleReceive() {
    // Navigate to receive screen
    // router.push('/wallet/receive')
  }

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <View style={styles.section}>
          <Text style={styles.walletName}>{walletName}</Text>
          {isOffline && (
            <View style={styles.offlineIndicator}>
              <IconSymbol name="lock.fill" size={14} color={colors.secondary} />
              <Text style={styles.offlineText}>Cold Wallet</Text>
            </View>
          )}
        </View>

        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceAmount}>{balance.toFixed(8)}</Text>
          <Text style={styles.balanceCurrency}>BTC</Text>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity onPress={handleSend} style={[styles.button, styles.primaryButton]}>
            <View style={styles.buttonContent}>
              <IconSymbol name="arrow.up" size={20} color="white" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Send</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleReceive} style={[styles.button, styles.secondaryButton]}>
            <View style={styles.buttonContent}>
              <IconSymbol name="arrow.down" size={20} color="white" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Receive</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.transactionsSection}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <View style={styles.emptyState}>
            <IconSymbol name="doc.text" size={32} color={alpha(colors.secondary, 0.8)} />
            <Text style={styles.emptyStateText}>No transactions yet</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: 'white',
  },
  container: {
    padding: 16,
    marginBottom: 24,
    gap: 24,
  },
  section: {
    marginBottom: 0,
  },
  walletName: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text.light,
    marginBottom: 8,
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: alpha(colors.secondary, 0.1),
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 4,
  },
  offlineText: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  balanceSection: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: alpha(colors.primary, 0.05),
    borderRadius: 12,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text.light,
  },
  balanceCurrency: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.secondary,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
  },
  transactionsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: alpha(colors.border.light, 0.3),
    borderRadius: 8,
    gap: 12,
  },
  emptyStateText: {
    color: colors.textSecondary.light,
  },
})
