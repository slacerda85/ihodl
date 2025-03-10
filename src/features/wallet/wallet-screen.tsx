import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { useColorScheme } from 'react-native'
import colors from '@/shared/theme/colors'
import { useRouter } from 'expo-router'

export default function WalletScreen() {
  const router = useRouter()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  function handleCreateWallet() {
    router.push('/wallet/create')
  }

  /* function handleImportWallet() {
    router.push('/')
  } */

  return (
    <ScrollView style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
        <Text style={[styles.heading, isDark && styles.headingDark]}>Manage wallets</Text>

        <TouchableOpacity onPress={handleCreateWallet} style={styles.primaryButton}>
          <Text style={styles.buttonText}>Create New Wallet</Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled
          /* onPress={handleImportWallet} */ style={styles.secondaryButton}
        >
          <Text style={styles.buttonText}>Import Wallet</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
  },
  containerDark: {
    backgroundColor: colors.background.dark,
  },
  contentWrapper: {
    padding: 24,
    marginBottom: 24,
  },
  contentWrapperDark: {
    // No additional styles needed, inherits from containerDark
  },
  walletBox: {
    width: '100%',
    height: '50%',
    borderWidth: 1,
    borderRadius: 6,
    borderColor: colors.border.light,
    marginBottom: 24,
  },
  walletBoxDark: {
    borderColor: colors.border.dark,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: 'black',
    marginBottom: 16,
  },
  headingDark: {
    color: 'white',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  secondaryButton: {
    backgroundColor: colors.secondary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
  },
  subText: {
    color: colors.textSecondary.light,
    marginBottom: 8,
  },
  subTextDark: {
    color: colors.textSecondary.dark,
  },
})
