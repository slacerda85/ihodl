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
    <ScrollView style={styles.container}>
      <View style={styles.contentWrapper}>
        <Text style={[styles.heading, isDark ? styles.headingDark : null]}>Manage wallets</Text>

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
    backgroundColor: 'white',
  },
  containerDark: {
    backgroundColor: 'black',
  },
  contentWrapper: {
    padding: 24,
    marginBottom: 24,
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
    borderColor: colors.border.dark, // gray-800
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
    backgroundColor: colors.primary, // primary color (assuming this is your primary color)
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  secondaryButton: {
    backgroundColor: colors.secondary, // secondary color (assuming this is your secondary color)
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
    color: colors.textSecondary.light, // gray-600
    marginBottom: 8,
  },
  subTextDark: {
    color: colors.textSecondary.dark, // gray-400
  },
})
