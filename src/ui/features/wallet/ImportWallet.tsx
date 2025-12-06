import React, { useState, useMemo } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, Switch } from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useRouter } from 'expo-router'
import wordlist from 'bip39/src/wordlists/english.json'
import { useWallet } from './WalletProvider'
import { useSettings } from '../settings/SettingsProvider'
import Button from '@/ui/components/Button'
import { GlassView } from 'expo-glass-effect'
import { useWalletActions } from './WalletProviderV2'

export default function ImportWallet() {
  const router = useRouter()
  const { createWallet } = useWalletActions()
  const [walletName, setWalletName] = useState<string>('')
  const [seedPhrase, setSeedPhrase] = useState<string>('')
  const [currentWord, setCurrentWord] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [usePassword, setUsePassword] = useState<boolean>(false)
  const { isDark } = useSettings()
  const [submitting, setSubmitting] = useState<boolean>(false)

  // Derivar suggestions via useMemo ao invés de useEffect + setState
  const suggestions = useMemo(() => {
    if (currentWord.length === 0) return []
    return wordlist.filter(word => word.startsWith(currentWord.toLowerCase())).slice(0, 5)
  }, [currentWord])

  const showSuggestions = suggestions.length > 0

  const handleSeedPhraseChange = (text: string) => {
    setSeedPhrase(text)

    // Extract the current word being typed (last word in the input)
    const words = text.trim().split(/\s+/)
    const lastWord = words[words.length - 1]

    setCurrentWord(lastWord || '')
  }

  const handleSelectSuggestion = (word: string) => {
    // Replace the last word with the selected suggestion
    const words = seedPhrase.trim().split(/\s+/)
    words.pop() // Remove the last word

    const newSeedPhrase = words.length > 0 ? words.join(' ') + ' ' + word + ' ' : word + ' '

    setSeedPhrase(newSeedPhrase)
    setCurrentWord('')
  }

  const isValidSeedPhrase = () => {
    const words = seedPhrase.trim().split(/\s+/)
    return words.length >= 12 && words.length <= 24
  }

  async function handleImportWallet() {
    if (!walletName.trim() || !isValidSeedPhrase()) {
      return
    }
    setSubmitting(true)
    try {
      // Use the wallet hook to import wallet - it handles all the lib calls and state updates
      createWallet({
        name: walletName.trim(),
        seed: seedPhrase.trim(),
        cold: false,
        password,
      })

      console.log('Wallet imported successfully')
      setSubmitting(false)
      router.dismiss(2)
    } catch (error) {
      console.error('Error importing wallet:', error)
    }
  }

  // Render suggestion item
  const renderSuggestion = ({ item }: { item: string }) => (
    <Pressable
      style={[styles.suggestionItem, isDark && styles.suggestionItemDark]}
      onPress={() => handleSelectSuggestion(item)}
    >
      <Text style={[styles.suggestionText, isDark && styles.suggestionTextDark]}>{item}</Text>
    </Pressable>
  )

  return (
    <View style={[styles.scrollView, isDark && styles.scrollViewDark]}>
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

        <GlassView style={styles.glass}>
          <View style={styles.toggleContainer}>
            <Text style={[styles.toggleText, isDark && styles.toggleTextDark]}>
              Encrypt with passphrase
            </Text>
            <Switch onValueChange={setUsePassword} value={usePassword} />
          </View>
        </GlassView>
        {usePassword && (
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            placeholder="Enter passphrase"
            placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        )}

        <View style={styles.section}>
          <TextInput
            style={[styles.seedInput, isDark && styles.inputDark]}
            placeholder="Enter seed phrase (12-24 words)"
            placeholderTextColor={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
            value={seedPhrase}
            onChangeText={handleSeedPhraseChange}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoComplete="off"
            autoCorrect={false}
          />
        </View>
        <View style={styles.section}>
          <View style={[styles.suggestionsContainer, isDark && styles.suggestionsContainerDark]}>
            {showSuggestions && (
              <FlatList
                data={suggestions}
                renderItem={renderSuggestion}
                keyExtractor={item => item}
                horizontal
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>
        </View>

        <Button
          disabled={!walletName.trim() || !isValidSeedPhrase()}
          onPress={handleImportWallet}
          tintColor={alpha(colors.primary, 0.8)}
          loading={submitting}
        >
          <Text style={styles.buttonText}>Import wallet</Text>
        </Button>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // ...existing styles
  scrollView: {
    flex: 1,
  },
  scrollViewDark: {},
  container: {
    padding: 16,
    marginBottom: 24,
    gap: 24,
  },
  containerDark: {},
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
  section: {
    position: 'relative', // For positioning the suggestions
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
  seedInput: {
    padding: 20,
    minHeight: 120,
    borderRadius: 32,
    backgroundColor: alpha(colors.black, 0.05),
    color: colors.text.light,
    textAlignVertical: 'top',
  },
  suggestionsContainer: {
    marginTop: 1,
    minHeight: 36,
  },
  suggestionsContainerDark: {
    // backgroundColor: colors.background.dark,
    // borderColor: alpha(colors.white, 0.2),
    // borderWidth: 1,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 4,
    backgroundColor: alpha(colors.black, 0.2),
    borderRadius: 4,
  },
  suggestionItemDark: {
    backgroundColor: alpha(colors.white, 0.2),
  },
  suggestionText: {
    color: colors.primary,
    fontWeight: '500',
  },
  suggestionTextDark: {
    color: alpha(colors.white, 0.9),
  },
  infoBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    marginRight: 8,
    marginTop: 2,
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
    borderRadius: 8,
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '500',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkboxText: {
    fontSize: 16,
    color: colors.text.light,
    marginLeft: 8,
  },
  checkboxTextDark: {
    color: colors.text.dark,
  },
})
