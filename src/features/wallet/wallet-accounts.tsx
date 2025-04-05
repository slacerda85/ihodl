import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, useColorScheme, FlatList, Pressable, Image } from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { IconSymbol } from '@/shared/ui/icon-symbol'
import { useWallet } from './wallet-provider'
import BitcoinLogo from '@/shared/assets/bitcoin-logo'
import { Link } from 'expo-router'
import { AccountType, AccountProtocol } from '@/shared/models/account'
import {
  createPublicKey,
  deriveFromPath,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key'
import api from '@/shared/api'

// Interface for list items
type ListItem =
  | { type: 'header'; id: string; title: string }
  | { type: 'account'; id: string; first?: boolean; last?: boolean; account: AccountData }

type AccountData = {
  id: string
  name: string
  accountType: AccountType // Optional, for type safety
  balance: number

  unit: string
}

const addressTypeLabels: Record<AccountType, string> = {
  bip44: 'BIP 44',
  bip49: 'BIP 49',
  bip84: 'BIP 84',
  bip86: 'BIP 86',
  'lightning-node': 'Lightning Node',
}

const protocolLabels: Record<AccountProtocol, string> = {
  lightning: 'Lightning',
  onchain: 'On-chain',
}

export default function WalletAccounts() {
  const { selectedWalletId, wallets, setSelectedAccount } = useWallet()
  const selectedWallet = useMemo(
    () => wallets.find(wallet => wallet.walletId === selectedWalletId),
    [wallets, selectedWalletId],
  )

  const accountData =
    selectedWallet !== undefined
      ? deriveFromPath(
          selectedWallet.accounts.bip84.privateKey,
          selectedWallet.accounts.bip84.chainCode,
          '0/0',
        )
      : undefined
  if (accountData === undefined) {
    console.error('No account data found')
  } else {
    const accountPublicKey = createPublicKey(accountData.derivedKey)
    const accountAddress = serializePublicKeyForSegWit(accountPublicKey)
    console.log('wallet name:', selectedWallet?.walletName)
    console.log(`First address: ${accountAddress}`)
  }

  const [isLoading, setIsLoading] = useState<boolean>(false)
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  // Define proper type for account balances
  const [accountBalances, setAccountBalances] = useState<Record<AccountType, number>>(
    {} as Record<AccountType, number>,
  )

  // Extract this function to reuse in both useEffect and onRefresh
  const fetchAccountBalances = useCallback(async () => {
    console.log('fetchWalletBalances called')
    if (!selectedWallet) {
      console.log('No wallet selected, returning')
      return
    }

    console.log('Setting isLoading to true')
    setIsLoading(true)
    const balances: Record<AccountType, number> = {} as Record<AccountType, number>

    try {
      console.log('Processing wallet accounts:', Object.keys(selectedWallet.accounts))
      // Use Object.entries to get both keys and values
      for await (const [accountType, account] of Object.entries(selectedWallet.accounts)) {
        const typedAccountType = accountType as AccountType
        // Only implement BIP84 for now, prepare others for future implementation
        if (typedAccountType === 'bip84') {
          const { privateKey, chainCode } = account
          if (privateKey.length === 0) {
            console.log('Private key is empty, skipping')
            continue
          }
          const accountData = deriveFromPath(privateKey, chainCode, '0/0') // Using 0 as index for now
          const accountPublicKey = createPublicKey(accountData.derivedKey)
          const accountAddress = serializePublicKeyForSegWit(accountPublicKey)
          console.log(`Fetching balance for address: ${accountAddress}`)
          // Fetch balance from controller
          const balance = await api.transactions.getBalance(accountAddress)
          console.log(`Received balance for ${typedAccountType}: ${balance}`)
          balances[typedAccountType] = balance
        } else {
          console.log(`${typedAccountType} implementation pending, setting balance to 0`)
          // For other account types, set up structure for future implementation
          balances[typedAccountType] = 0
        }
      }

      console.log('Updating account balances with:', balances)
      // Update the state with all balances
      setAccountBalances(balances)
    } catch (error) {
      console.error('Failed to fetch account balances:', error)
    } finally {
      console.log('Setting isLoading to false')
      setIsLoading(false)
    }
  }, [selectedWallet]) // Ensure it only runs when selectedWallet changes

  // Fetch balances for all accounts in the selected wallet
  useEffect(() => {
    console.log('useEffect triggered, calling fetchAccountBalances')
    fetchAccountBalances()
  }, [fetchAccountBalances])

  // Prepare data for FlatList with headers and accounts
  const prepareAccountsData = (): ListItem[] => {
    const result: ListItem[] = []

    if (!selectedWallet) {
      return result
    }

    // title for Accounts section
    result.push({
      type: 'header',
      id: 'accounts',
      title: 'Accounts',
    })

    Object.keys(selectedWallet.accounts).forEach((accountType, index) => {
      if (accountType === undefined) return
      const accountId = `${accountType}-${index}`
      result.push({
        type: 'account',
        id: accountId,
        first: index === 0,
        last: index === Object.keys(selectedWallet.accounts).length - 1,
        account: {
          id: accountId,
          name: addressTypeLabels[accountType as AccountType],
          accountType: accountType as AccountType,
          balance: accountBalances[accountType as AccountType] || 0,
          unit: 'BTC',
        },
      })
    })

    /* Object.entries(selectedWallet?.accounts).forEach(([accountType, account]) => {
      if (accountType.includes('lightning')) {
        result.push({
          type: 'header',
          id: accountType,
          title: protocolLabels.lightning as string,
        })
      } else {
        result.push({
          type: 'header',
          id: accountType,
          title: protocolLabels.onchain as string,
        })
      } */

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
      if (account.accountType.includes('lightning')) {
        return (
          <Image
            source={require('@/shared/assets/lightning-logo.png')}
            style={{ width: 24, height: 24 }}
          />
        )
      } else if (account.accountType.includes('bip')) {
        return <BitcoinLogo width={24} height={24} />
      } else {
        return (
          <IconSymbol
            name="questionmark.circle"
            size={20}
            color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          />
        )
      }

      /* switch (account.) {
        case 'BTC':
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
      } */
    }

    return (
      <Link
        href={{
          pathname: '/wallet/transactions',
        }}
        asChild
        style={[
          styles.transactionItem,
          item.first && styles.transactionItemFirst,
          item.last && styles.transactionItemLast,
          isDark && styles.transactionItemDark,
        ]}
        onPress={() => setSelectedAccount(account.accountType)}
      >
        <Pressable>
          <View style={styles.accountIconContainer}>{getProtocolIcon()}</View>
          <View style={styles.transactionDetails}>
            <Text style={[styles.contactName, isDark && styles.contactNameDark]}>
              {`${account.name}`}
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
        refreshing={isLoading}
        onRefresh={fetchAccountBalances}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    paddingVertical: 8,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  flatList: {
    paddingBottom: 48,
    gap: 1,
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
    marginBottom: 16,
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
