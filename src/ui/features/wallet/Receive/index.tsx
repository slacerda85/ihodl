import { useState } from 'react'
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native'

import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useSettings } from '../../settings/SettingsProvider'

import Receive from './Receive'
import ReceiveLightning from './ReceiveLightning'
import { GlassView } from 'expo-glass-effect'

type ReceiveMode = 'onchain' | 'lightning'

export default function ReceiveScreen() {
  const { isDark } = useSettings()
  const [mode, setMode] = useState<ReceiveMode>('onchain')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  const amountValue = amount ? BigInt(amount) : 0n
  const descriptionValue = description || 'Payment'

  return (
    <View style={styles.container}>
      {/* Mode Selector */}
      <View style={[styles.selectorContainer, isDark && styles.selectorContainerDark]}>
        <Pressable
          style={[
            styles.selectorButton,
            mode === 'onchain' && styles.selectorButtonActive,
            mode === 'onchain' && isDark && styles.selectorButtonActiveDark,
          ]}
          onPress={() => setMode('onchain')}
        >
          <Text
            style={[
              styles.selectorText,
              isDark && styles.selectorTextDark,
              mode === 'onchain' && styles.selectorTextActive,
            ]}
          >
            On-Chain
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.selectorButton,
            mode === 'lightning' && styles.selectorButtonActive,
            mode === 'lightning' && isDark && styles.selectorButtonActiveDark,
          ]}
          onPress={() => setMode('lightning')}
        >
          <Text
            style={[
              styles.selectorText,
              isDark && styles.selectorTextDark,
              mode === 'lightning' && styles.selectorTextActive,
            ]}
          >
            Lightning
          </Text>
        </Pressable>
      </View>

      {/* Lightning Inputs */}
      {mode === 'lightning' && (
        <View style={[styles.inputsContainer, isDark && styles.inputsContainerDark]}>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            placeholder="Amount (sats)"
            placeholderTextColor={colors.textSecondary[isDark ? 'dark' : 'light']}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            placeholder="Description"
            placeholderTextColor={colors.textSecondary[isDark ? 'dark' : 'light']}
            value={description}
            onChangeText={setDescription}
          />
        </View>
      )}

      {/* Content */}
      <GlassView style={{ borderRadius: 32 }}>
        {mode === 'onchain' ? (
          <Receive />
        ) : (
          <ReceiveLightning amount={amountValue} description={descriptionValue} />
        )}
      </GlassView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
  },
  selectorContainer: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 16,
    backgroundColor: alpha(colors.black, 0.05),
    borderRadius: 32,
    padding: 4,
  },
  selectorContainerDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  selectorButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 32,
    alignItems: 'center',
  },
  selectorButtonActive: {
    backgroundColor: colors.white,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectorButtonActiveDark: {
    backgroundColor: alpha(colors.background.light, 0.1),
  },
  selectorText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary.light,
  },
  selectorTextDark: {
    color: colors.textSecondary.dark,
  },
  selectorTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  selectorTextInactive: {
    color: alpha(colors.textSecondary.light, 0.5),
  },
  inputsContainer: {
    marginHorizontal: 24,
    marginBottom: 16,
    gap: 12,
  },
  inputsContainerDark: {},
  input: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: alpha(colors.black, 0.05),
    color: colors.text.light,
    fontSize: 16,
  },
  inputDark: {
    backgroundColor: alpha(colors.white, 0.05),
    color: colors.text.dark,
  },
})
