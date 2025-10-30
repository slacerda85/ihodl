import { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { GlassView } from 'expo-glass-effect'

import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useSettings } from '@/features/storage'

import Receive from './Receive'
import ReceiveLightning from './ReceiveLightning'

type ReceiveMode = 'onchain' | 'lightning'

export default function ReceiveScreen() {
  const { isDark } = useSettings()
  const [mode, setMode] = useState<ReceiveMode>('onchain')

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

      {/* Content */}
      {/* <GlassView style={{ borderRadius: 32 }}> */}
      {mode === 'onchain' ? <Receive /> : <ReceiveLightning />}
      {/* </GlassView> */}
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
})
