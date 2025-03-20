import React from 'react'
import { View, Text, StyleSheet, useColorScheme, FlatList, Pressable, Image } from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { IconSymbol } from '@/shared/ui/icon-symbol'
import { useWallet } from './wallet-provider'
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import { Link } from 'expo-router'
import LightningLogo from '@/shared/assets/lightning-logo'

// Interface for account types
type Account = {
  id: string
  name: string
  protocol: 'onchain' | 'lightning'
  balance: number
  unit: string
}

// Interface for list items
type ListItem =
  | { type: 'header'; id: string; title: string }
  | { type: 'account'; id: string; first?: boolean; last?: boolean; account: Account }

export default function WalletAccounts() {
  const { selectedWalletId, wallets } = useWallet()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const selectedWallet = wallets.find(wallet => wallet.walletId === selectedWalletId)

  // Example accounts data
  const accounts: Account[] = [
    {
      id: '1',
      name: 'Native Segwit',
      protocol: 'onchain',
      balance:
        selectedWallet?.transactions.reduce((acc, tx) => {
          // check for onChain or lightning
          if (tx.network === 'onChain') {
            return acc + tx.value
          }
          return acc
        }, 0) || 0,
      unit: 'BTC',
    },
    {
      id: '2',
      name: 'Lightning',
      protocol: 'lightning',
      balance:
        selectedWallet?.transactions.reduce((acc, tx) => {
          // check for onChain or lightning
          if (tx.network === 'lightning') {
            return acc + tx.value
          }
          return acc
        }, 0) || 0,
      unit: 'BTC',
    },
  ]

  // Prepare data for FlatList with headers and accounts
  const prepareAccountsData = (): ListItem[] => {
    const result: ListItem[] = []

    // Savings account section (OnChain)
    result.push({ type: 'header', id: 'savings-header', title: 'Savings accounts' })

    const savingsAccounts = accounts.filter(acc => acc.protocol === 'onchain')
    savingsAccounts.forEach((account, index) => {
      result.push({
        type: 'account',
        id: account.id,
        first: index === 0,
        last: index === savingsAccounts.length - 1,
        account,
      })
    })

    // Spending accounts section (Lightning, Liquid, etc.)
    result.push({ type: 'header', id: 'spending-header', title: 'Spending accounts' })

    const spendingAccounts = accounts.filter(acc => acc.protocol !== 'onchain')
    spendingAccounts.forEach((account, index) => {
      result.push({
        type: 'account',
        id: account.id,
        first: index === 0,
        last: index === spendingAccounts.length - 1,
        account,
      })
    })

    return result
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    // Render section header
    if (item.type === 'header') {
      return (
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{item.title}</Text>
      )
    }

    // Render account item
    const { account } = item

    // Format balance
    const formattedBalance = `${account.balance.toLocaleString('pt-BR', {
      maximumFractionDigits: 8,
    })}`

    // Get protocol icon
    const getProtocolIcon = () => {
      switch (account.protocol) {
        case 'onchain':
          return <BitcoinLogo width={24} height={24} />
        case 'lightning':
          return (
            <Image
              source={require('@/shared/assets/lightning-logo.png')}
              style={{ width: 24, height: 24 }}
            />
          )
        default:
          return (
            <IconSymbol
              name="questionmark.circle"
              size={20}
              color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            />
          )
      }
    }

    return (
      <Link
        href={{
          pathname: '/wallet/transactions',
          params: { id: selectedWalletId },
        }}
        asChild
        style={[
          styles.transactionItem,
          item.first && styles.transactionItemFirst,
          item.last && styles.transactionItemLast,
          isDark && styles.transactionItemDark,
        ]}
      >
        <Pressable>
          <View style={styles.accountIconContainer}>{getProtocolIcon()}</View>
          <View style={styles.transactionDetails}>
            <Text style={[styles.contactName, isDark && styles.contactNameDark]}>
              {account.name}
            </Text>
            <View style={styles.accountBalanceWrapper}>
              <Text style={[styles.accountBalance, isDark && styles.accountBalanceDark]}>
                {formattedBalance}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.primary,
                }}
              >{`${account.unit}`}</Text>
            </View>
          </View>

          <IconSymbol
            name="chevron.right"
            size={20}
            color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          />
        </Pressable>
      </Link>
    )
  }

  const listData = prepareAccountsData()

  return (
    <View style={styles.transactionsSection}>
      <FlatList<ListItem>
        data={listData}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.flatList}
        // showsVerticalScrollIndicator={false}
        // ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  flatList: {
    paddingBottom: 48,
    gap: 12,
  },
  accountBalanceWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  transactionsSection: {
    flex: 1,
    // gap: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
  },
  transactionItemFirst: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  transactionItemLast: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    marginBottom: 8,
  },
  transactionItemDark: {
    backgroundColor: alpha(colors.white, 0.1),
  },
  accountIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionDetails: {
    flex: 1,
    gap: 2,
  },
  contactName: {
    fontSize: 14,
    // fontWeight: '500',
    color: colors.textSecondary.light,
  },
  contactNameDark: {
    color: colors.textSecondary.dark,
  },
  accountBalance: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  accountBalanceDark: {
    color: colors.text.dark,
  },
})
