import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
} from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
import { IconSymbol } from '@/shared/ui/icon-symbol'
// import { useWallet } from './wallet-provider'
import { useRouter } from 'expo-router'

export default function CreateWallet() {
  const router = useRouter()
  // const { createWallet } = useWallet()
  const [offline, setOffline] = useState<boolean>(false)
  const [walletName, setWalletName] = useState<string>('')

  function handleCreateWallet() {
    router.push('/wallet/details')
    // createWallet()
  }

  function handleToggleOffline() {
    setOffline(prev => !prev)
  }

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <View style={styles.section}>
          <TextInput
            style={styles.input}
            placeholder="Enter wallet name"
            value={walletName}
            onChangeText={setWalletName}
          />
        </View>
        <View style={[styles.toggleSection, offline ? styles.toggleSectionActive : null]}>
          <View style={styles.toggleContainer}>
            <Text style={styles.toggleText}>Offline mode (cold wallet)</Text>
            <Switch onValueChange={handleToggleOffline} value={offline} />
          </View>
          <View style={styles.infoBox}>
            <IconSymbol
              name="info.circle.fill"
              size={16}
              style={styles.infoIcon}
              color={colors.secondary}
            />
            <Text style={styles.infoText}>
              Prevents this wallet to access the internet. Transactions are available by using QR
              codes.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleCreateWallet}
          style={[styles.button, offline ? styles.secondaryButton : styles.primaryButton]}
        >
          <Text style={styles.buttonText}>{offline ? 'Create cold wallet' : 'Create wallet'}</Text>
        </TouchableOpacity>
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
  label: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 8,
  },
  input: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 8,
  },
  toggleSection: {
    backgroundColor: alpha(colors.secondary, 0.1),
    // borderWidth: 1,
    // borderColor: alpha(colors.secondary, 0.2),
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  toggleSectionActive: {
    // borderColor: colors.secondary,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleText: {
    fontSize: 18,
    fontWeight: '500',
    color: alpha(colors.secondary, 0.8),
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
    backgroundColor: 'white',
  },
  toggleHandleActive: {
    transform: [{ translateX: 24 }],
  },
  infoBox: {
    marginVertical: 8,
    // padding: 12,
    // backgroundColor: alpha(colors.info, 0.1),
    // borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    marginRight: 8,
    color: colors.info,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
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
  },
})
