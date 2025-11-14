import { useState, useCallback } from 'react'

import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View } from 'react-native'

import { GlassView } from 'expo-glass-effect'
import { useRouter } from 'expo-router'

import { alpha } from '@/ui/utils'
import Button from '@/ui/Button'
import colors from '@/ui/colors'
import { IconSymbol } from '@/ui/IconSymbol/IconSymbol'

import { useSettings } from '@/features/settings'
import { useWallet } from '@/features/wallet'

export default function CreateWallet() {
  const { isDark } = useSettings()

  const router = useRouter()
  const { createWallet } = useWallet()
  const [submitting, setSubmitting] = useState<boolean>(false)

  const [cold, setCold] = useState<boolean>(false)
  const [walletName, setWalletName] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [usePassword, setUsePassword] = useState<boolean>(false)

  const handleCreateWallet = useCallback(async () => {
    setSubmitting(true)
    if (walletName.trim().length === 0) {
      setSubmitting(false)
      return
    }
    try {
      // Use the wallet hook to create wallet - it handles all the lib calls and state updates
      await createWallet({
        name: walletName.trim(),
        cold,
        accounts: [],
        password,
      })

      console.log('Wallet created successfully')
      setSubmitting(false)
      router.dismiss(2)
    } catch (error) {
      console.error('Error creating wallet:', error)
    }
  }, [walletName, cold, password, createWallet, router])

  function handleToggleCold() {
    setCold(prev => !prev)
  }

  return (
    <View style={styles.root}>
      <TextInput
        autoFocus
        style={[styles.input, isDark && styles.inputDark]}
        placeholder="Enter wallet name"
        placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
        value={walletName}
        onChangeText={setWalletName}
      />
      <GlassView style={styles.glass}>
        <View style={styles.toggleContainer}>
          <Text style={[styles.toggleText, isDark && styles.toggleTextDark]}>
            Enable seed passphrase
          </Text>
          <Switch onValueChange={setUsePassword} value={usePassword} />
        </View>
      </GlassView>
      {usePassword && (
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          placeholder="Enter password for encryption"
          placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      )}

      <GlassView style={styles.coldWalletInfo}>
        <View style={styles.toggleContainer}>
          <Text style={[styles.toggleText, isDark && styles.toggleTextDark]}>
            Offline mode (cold wallet)
          </Text>
          <Switch onValueChange={handleToggleCold} value={cold} />
        </View>
        <GlassView
          style={styles.infoBox}
          tintColor={alpha(colors.background[isDark ? 'light' : 'dark'], 0.05)}
        >
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
        </GlassView>
      </GlassView>

      <Button onPress={handleCreateWallet} tintColor={alpha(colors.primary, 0.8)}>
        {submitting ? <ActivityIndicator color={cold ? colors.primary : colors.white} /> : null}
        <Text style={{ color: isDark ? colors.textSecondary.dark : colors.textSecondary.light }}>
          {submitting ? 'Creating...' : cold ? 'Create cold wallet' : 'Create wallet'}
        </Text>
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 20,
    marginBottom: 24,
    gap: 24,
  },
  input: {
    padding: 16,
    height: 48,
    borderRadius: 32,
    backgroundColor: alpha(colors.black, 0.05),
    color: colors.text.light,
  },
  inputDark: {
    color: colors.text.dark,
    backgroundColor: alpha(colors.white, 0.1),
  },
  glass: {
    borderRadius: 32,
    padding: 20,
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
  coldWalletInfo: {
    borderRadius: 32,
    padding: 20,
    gap: 24,
  },
  infoBox: {
    borderRadius: 20,
    padding: 20,
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
})
