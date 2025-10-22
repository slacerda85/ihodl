// React and React Native
import { Link, useRouter } from 'expo-router'
import { StyleSheet, Text, Pressable, View } from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useWallet, useSettings } from '../store'
import { GlassView, GlassContainer } from 'expo-glass-effect'

// Components
import WalletBalance from './WalletBalance'
import WalletAccounts from './WalletAccounts'
import Divider from '@/ui/Divider'
import CreateWalletIcon from './CreateWalletIcon'
import ImportWalletIcon from './ImportWalletIcon'
import ContentContainer from '@/ui/ContentContainer'
import Button from '@/ui/Button'
import { useHeaderHeight } from '@react-navigation/elements'

export default function WalletScreen() {
  const router = useRouter()
  const headerHeight = useHeaderHeight()
  // theme
  const { isDark } = useSettings()

  // Hook de inicialização para carregar transações automaticamente
  // useInitialize() // Removido para evitar inicialização duplicada

  function handleSend() {
    // Navigate to send screen
    router.push('/wallet/send' as any)
  }

  function handleReceive() {
    // Navigate to receive screen
    router.push('/wallet/receive' as any)
  }

  function handleCreateWallet() {
    router.push('/wallet/create')
  }

  function handleImportWallet() {
    router.push('/wallet/import')
  }

  const { activeWalletId, wallets } = useWallet()
  // Removed fetchTransactions call - now handled by TransactionsScreen

  // Transaction sync logic can be handled by individual components that need it

  if (wallets === undefined || wallets?.length === 0) {
    // create link to wallet/manage
    return (
      <ContentContainer>
        <View style={styles.emptyState}>
          <Text style={[styles.walletName, isDark && styles.walletNameDark]}>No wallets found</Text>
          <Divider
            orientation="horizontal"
            color={
              isDark ? alpha(colors.background.light, 0.05) : alpha(colors.background.dark, 0.05)
            }
          />
          <View>
            <Pressable
              onPress={handleCreateWallet}
              style={[
                styles.neutralButton,
                styles.neutralButtonFirst,
                isDark && styles.neutralButtonDark,
              ]}
            >
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CreateWalletIcon size={24} color={colors.primary} />
                <Text style={styles.neutralButtonText}>Create New Wallet</Text>
              </View>
            </Pressable>
            <Divider
              orientation="horizontal"
              color={isDark ? alpha(colors.background.light, 0.1) : colors.background.light}
            />

            <Pressable
              onPress={handleImportWallet}
              style={[
                styles.neutralButton,
                styles.neutralButtonLast,
                // styles.secondaryButton,
                isDark && styles.neutralButtonDark,
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ImportWalletIcon size={24} color={colors.primary} />

                <Text style={styles.neutralButtonText}>Import Wallet</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </ContentContainer>
    )
  } else if (activeWalletId === undefined) {
    // create link to wallet/manage
    return (
      <ContentContainer>
        <View style={styles.emptyState}>
          <Text style={[styles.walletName, isDark && styles.walletNameDark]}>
            No wallet selected
          </Text>
          <View style={[styles.button, styles.primaryButton]}>
            <Link href="/wallet/manage">
              <Text style={[styles.buttonText, isDark && styles.buttonTextSecondary]}>
                Select a wallet
              </Text>
            </Link>
          </View>
        </View>
      </ContentContainer>
    )
  }

  return (
    <ContentContainer>
      <View style={{ gap: 32 }}>
        <WalletBalance />
        <View style={styles.actionsSection}>
          <Button onPress={handleSend} style={{ flex: 1 }}>
            <GlassView isInteractive style={styles.button} tintColor={alpha(colors.primary, 0.8)}>
              <Text style={[styles.buttonText]}>Send</Text>
            </GlassView>
          </Button>

          <Button onPress={handleReceive} style={{ flex: 1 }}>
            <GlassView isInteractive style={styles.button}>
              <Text style={[styles.buttonTextSecondary, isDark && styles.buttonTextSecondaryDark]}>
                Receive
              </Text>
            </GlassView>
          </Button>
        </View>

        <View style={styles.accountsSection}>
          <Text style={[styles.accountsHeader, isDark && styles.accountsHeaderDark]}>Accounts</Text>

          <WalletAccounts />
        </View>
      </View>
    </ContentContainer>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 0,
  },
  walletName: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text.light,
    marginBottom: 8,
  },
  walletNameDark: {
    color: colors.text.dark,
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor: alpha(colors.secondary, 0.1),
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
    borderRadius: 12,
    gap: 4,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  balanceLabelDark: {
    color: colors.textSecondary.dark,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text.light,
  },
  balanceAmountDark: {
    color: colors.text.dark,
  },
  balanceCurrency: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  actionsSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  buttonIcon: {
    marginRight: 8,
  },
  button: {
    flex: 1,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
    backgroundColor: alpha(colors.primary, 0.8),
  },
  primaryButtonDark: {
    backgroundColor: alpha(colors.primary, 0.2),
    boxShadow: `0 1px 2px ${alpha(colors.primary, 0.4)}`,
  },
  buttonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
  },
  buttonTextSecondary: {
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  buttonTextSecondaryDark: {
    color: alpha(colors.textSecondary.dark, 0.85),
  },
  accountsSection: {
    // backgroundColor: 'red',
  },
  accountsHeader: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 16,
  },
  accountsHeaderDark: {
    color: colors.text.dark,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 16,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  emptyState: {
    paddingHorizontal: 16,
    gap: 24,
  },
  emptyStateText: {
    fontSize: 20,
    color: colors.textSecondary.light,
  },
  emptyStateTextDark: {
    color: colors.textSecondary.dark,
  },
  // wallet box
  neutralButton: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  neutralButtonDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  neutralButtonFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  neutralButtonLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  neutralButtonText: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.primary,
  },
  selectedWalletBox: {
    backgroundColor: colors.border.light, // alpha(colors.primary, 0.1),
    // borderColor: alpha(colors.primary, 0.2),
    // borderWidth: 1,
  },
  selectedWalletBoxDark: {
    backgroundColor: colors.border.dark,
  },
  neutralButtonLoading: {
    opacity: 0.5,
  },
})
