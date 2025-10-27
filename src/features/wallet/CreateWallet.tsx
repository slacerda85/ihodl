import { useState } from 'react'
import { View, Text, TextInput, StyleSheet, Switch, ActivityIndicator } from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/IconSymbol/IconSymbol'
import { useRouter } from 'expo-router'
import { useWallet, useSettings } from '@/features/storage'
import Button from '@/ui/Button'
import { GlassView } from 'expo-glass-effect'

export default function CreateWallet() {
  const { isDark } = useSettings()

  const router = useRouter()
  const { createWallet } = useWallet()
  const [submitting, setSubmitting] = useState<boolean>(false)

  const [offline, setOffline] = useState<boolean>(false)
  const [walletName, setWalletName] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [usePassword, setUsePassword] = useState<boolean>(false)

  function handleCreateWallet() {
    setSubmitting(true)
    if (walletName.trim().length === 0) {
      return
    }
    try {
      createWallet(
        {
          walletName,
          cold: offline,
        },
        usePassword && password ? password : undefined,
      )
    } catch (error) {
      console.error('Error creating wallet:', error)
    } finally {
      setSubmitting(false)
      router.dismiss(2)
    }
  }

  function handleToggleOffline() {
    setOffline(prev => !prev)
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

      <GlassView style={styles.toggleContainer}>
        <Text style={[styles.toggleText, isDark && styles.toggleTextDark]}>
          Enable seed passphrase
        </Text>
        <Switch onValueChange={setUsePassword} value={usePassword} />
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
        <View
          style={{
            width: '100%',
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={[styles.toggleText, isDark && styles.toggleTextDark]}>
            Offline mode (cold wallet)
          </Text>
          <Switch onValueChange={handleToggleOffline} value={offline} />
        </View>
        <GlassView style={styles.infoBox} tintColor={alpha(colors.info, 0.2)}>
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
        {submitting ? <ActivityIndicator color={offline ? colors.primary : colors.white} /> : null}
        <Text style={{ color: isDark ? colors.textSecondary.dark : colors.textSecondary.light }}>
          {submitting ? 'Creating...' : offline ? 'Create cold wallet' : 'Create wallet'}
        </Text>
      </Button>
      {/* </View> */}
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
    borderRadius: 32,
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
    borderRadius: 32,
    padding: 22,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    // justifyContent: 'space-between',
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
    borderRadius: 20,
    padding: 20,
    // marginVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  coldWalletInfo: {
    borderRadius: 32,
    padding: 20,
    gap: 24,
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
  outlinedButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
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
  buttonTextOutlined: {
    color: colors.primary,
  },
  buttonTextDark: {
    color: colors.black,
  },
  /* checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  }, */
  checkboxText: {
    fontSize: 16,
    color: colors.text.light,
    marginLeft: 8,
  },
  checkboxTextDark: {
    color: colors.text.dark,
  },
})
