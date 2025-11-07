import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useWallet } from './WalletProvider'
import { useSettings } from '../settings/SettingsProvider'
import { alpha } from '@/ui/utils'
import colors from '@/ui/colors'
import Divider from '@/ui/Divider'
import { getWalletSeedPhrase } from '@/lib/secureStorage'

export default function GetSeedPhraseScreen() {
  const { isDark } = useSettings()
  const { state: walletState } = useWallet()
  const { activeWalletId } = walletState
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSeedPhrase = async () => {
      if (!activeWalletId) {
        setLoading(false)
        return
      }

      try {
        // TODO: Get password from user or state
        const password = '' // Temporary: assume no password for now
        const phrase = await getWalletSeedPhrase(activeWalletId, password)
        setSeedPhrase(phrase)
      } catch (error) {
        console.error('Error loading seed phrase:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSeedPhrase()
  }, [activeWalletId])

  if (!activeWalletId) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.subText, isDark && styles.subTextDark]}>No wallet selected</Text>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.subText, isDark && styles.subTextDark]}>Loading seed phrase...</Text>
      </View>
    )
  }

  if (!seedPhrase) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.subText, isDark && styles.subTextDark]}>
          Seed phrase not available
        </Text>
      </View>
    )
  }

  const words = seedPhrase.split(' ')

  return (
    <ScrollView style={styles.scrollView}>
      <View style={[styles.contentWrapper, isDark && styles.contentWrapperDark]}>
        <View style={styles.section}>
          <Text style={[styles.heading, isDark && styles.headingDark]}>Your Seed Phrase</Text>
          <Text style={[styles.subText, isDark && styles.subTextDark]}>
            Write down your seed phrase and keep it in a safe place. This is the only way to recover
            your wallet.
          </Text>
        </View>

        <Divider
          orientation="horizontal"
          color={
            isDark ? alpha(colors.background.light, 0.05) : alpha(colors.background.dark, 0.05)
          }
        />

        <View style={[styles.seedPhraseContainer, isDark && styles.seedPhraseContainerDark]}>
          {words.map((word, index) => (
            <View key={index} style={[styles.wordBox, isDark && styles.wordBoxDark]}>
              <Text style={[styles.wordIndex, isDark && styles.wordIndexDark]}>{index + 1}</Text>
              <Text style={[styles.word, isDark && styles.wordDark]}>{word}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    paddingTop: 24,
  },
  contentWrapper: {
    paddingHorizontal: 24,
    gap: 24,
    paddingBottom: 40,
  },
  contentWrapperDark: {
    // No additional styles needed, inherits from containerDark
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  section: {
    gap: 12,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.light,
  },
  headingDark: {
    color: colors.text.dark,
  },
  subText: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary.light,
  },
  subTextDark: {
    color: colors.textSecondary.dark,
  },
  seedPhraseContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    // padding: 8,
    borderRadius: 16,
    // backgroundColor: alpha(colors.black, 0.05),
  },
  seedPhraseContainerDark: {
    // backgroundColor: alpha(colors.background.light, 0.05),
  },
  wordBox: {
    width: '31%', // Just under 1/3 to fit 3 in a row with gap
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wordBoxDark: {
    backgroundColor: alpha(colors.background.light, 0.05),
  },
  wordIndex: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary.light,
    minWidth: 16,
  },
  wordIndexDark: {
    color: colors.textSecondary.dark,
  },
  word: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  wordDark: {
    color: colors.primary,
  },
})
