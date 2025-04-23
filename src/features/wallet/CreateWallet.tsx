import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  useColorScheme,
  ActivityIndicator,
} from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { IconSymbol } from '@/shared/ui/icon-symbol'
import { useRouter } from 'expo-router'
import { createWallet } from '@/lib/wallet'
import { useWallet } from './WalletProvider'

export default function CreateWallet() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const router = useRouter()
  const { revalidateWallets, revalidateSelectedWalletId } = useWallet()
  const [offline, setOffline] = useState<boolean>(false)
  const [walletName, setWalletName] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)

  async function handleCreateWallet() {
    try {
      setSubmitting(true)
      const response = await createWallet({
        walletName,
        cold: offline,
      })
      if (!response.success) {
        console.error('Failed to create wallet')
        return
      }
      await revalidateWallets()
      await revalidateSelectedWalletId()
      router.dismiss(2)
    } catch (error) {
      console.error('Error creating wallet:', error)
    } finally {
      setSubmitting(false)
    }
  }

  function handleToggleOffline() {
    setOffline(prev => !prev)
  }

  return (
    <ScrollView style={[styles.scrollView, isDark && styles.scrollViewDark]}>
      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.section}>
          <TextInput
            autoFocus
            style={[styles.input, isDark && styles.inputDark]}
            placeholder="Enter wallet name"
            placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            value={walletName}
            onChangeText={setWalletName}
          />
        </View>
        <View
          style={[
            styles.toggleSection,
            isDark && styles.toggleSectionDark,
            offline ? (isDark ? styles.toggleSectionActiveDark : styles.toggleSectionActive) : null,
          ]}
        >
          <View style={styles.toggleContainer}>
            <Text style={[styles.toggleText, isDark && styles.toggleTextDark]}>
              Offline mode (cold wallet)
            </Text>
            <Switch onValueChange={handleToggleOffline} value={offline} />
          </View>
          <View style={styles.infoBox}>
            <IconSymbol
              name="info.circle.fill"
              size={16}
              style={styles.infoIcon}
              color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            />
            <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
              Prevents this wallet to access the internet. Transactions are available by using QR
              codes.
            </Text>
          </View>
        </View>
        <Pressable
          onPress={handleCreateWallet}
          style={[
            styles.button,
            offline
              ? isDark
                ? styles.secondaryButtonDark
                : styles.secondaryButton
              : styles.primaryButton,
          ]}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color={colors.white} /> : null}
          <Text
            style={[styles.buttonText, offline ? (isDark ? styles.buttonTextDark : null) : null]}
          >
            {submitting ? 'Creating...' : offline ? 'Create cold wallet' : 'Create wallet'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    // backgroundColor: colors.background.light,
  },
  scrollViewDark: {
    // backgroundColor: colors.background.dark,
  },
  container: {
    padding: 16,
    marginBottom: 24,
    gap: 24,
  },
  containerDark: {
    // No additional styles needed as it inherits from scrollViewDark
  },
  section: {
    marginBottom: 0,
  },
  label: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 8,
  },
  labelDark: {
    color: colors.text.dark,
  },
  input: {
    padding: 16,
    height: 48,
    // borderWidth: 1,
    // borderColor: alpha(colors.black, 0.2),
    borderRadius: 16,
    backgroundColor: alpha(colors.black, 0.05),
    color: colors.text.light,
  },
  inputDark: {
    // borderColor: alpha(colors.white, 0.2),
    color: colors.text.dark,
    backgroundColor: alpha(colors.white, 0.1),
  },
  toggleSection: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  toggleSectionDark: {
    backgroundColor: alpha(colors.white, 0.1),
  },
  toggleSectionActive: {
    // borderColor: colors.secondary,
  },
  toggleSectionActiveDark: {
    // Custom styling for active toggle in dark mode if needed
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleText: {
    fontSize: 18,
    fontWeight: '500',
    color: alpha(colors.text.light, 0.8),
  },
  toggleTextDark: {
    color: alpha(colors.text.dark, 0.9),
  },
  toggle: {
    width: 56,
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  toggleActive: {
    backgroundColor: colors.secondary,
  },
  toggleInactive: {
    backgroundColor: alpha(colors.secondary, 0.2),
  },
  toggleHandle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  toggleHandleActive: {
    transform: [{ translateX: 24 }],
  },
  infoBox: {
    marginVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    marginRight: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  infoTextDark: {
    color: colors.textSecondary.dark,
  },
  button: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.black,
  },
  secondaryButtonDark: {
    backgroundColor: colors.background.light,
  },
  disabledButton: {
    backgroundColor: alpha(colors.black, 0.2),
  },
  buttonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '500',
  },
  buttonTextDark: {
    color: colors.black,
  },
})
