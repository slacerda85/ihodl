import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  FlatList,
} from 'react-native'
import colors from '@/shared/theme/colors'
import { alpha } from '@/shared/theme/utils'
// import { useWallet } from './wallet-provider'
import { useRouter } from 'expo-router'
import wordlist from 'bip39/src/wordlists/english.json'
import { createWallet } from '@/lib/wallet'
import { useWallet } from './WalletProvider'

export default function ImportWallet() {
  const router = useRouter()
  const { selectWalletId } = useWallet()
  const [walletName, setWalletName] = useState<string>('')
  const [seedPhrase, setSeedPhrase] = useState<string>('')
  const [currentWord, setCurrentWord] = useState<string>('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false)
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  useEffect(() => {
    if (currentWord.length > 0) {
      // Filter wordlist for suggestions that start with the current word
      const filteredSuggestions = wordlist
        .filter(word => word.startsWith(currentWord.toLowerCase()))
        .slice(0, 5) // Limit to 5 suggestions for better UX

      setSuggestions(filteredSuggestions)
      setShowSuggestions(filteredSuggestions.length > 0)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [currentWord])

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
    setShowSuggestions(false)
  }

  const isValidSeedPhrase = () => {
    const words = seedPhrase.trim().split(/\s+/)
    return words.length >= 12 && words.length <= 24
  }

  async function handleImportWallet() {
    if (!walletName.trim() || !isValidSeedPhrase()) {
      return
    }
    console.log('Importing wallet with name:', walletName)

    const response = await createWallet({
      walletName,
      seedPhrase,
      cold: false, // Assuming this is a hot wallet import
    })

    if (!response) {
      console.error('Failed to import wallet')
      return
    }
    await selectWalletId(response.walletId)
    router.dismiss(2)
  }

  // Render suggestion item
  const renderSuggestion = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[styles.suggestionItem, isDark && styles.suggestionItemDark]}
      onPress={() => handleSelectSuggestion(item)}
    >
      <Text style={[styles.suggestionText, isDark && styles.suggestionTextDark]}>{item}</Text>
    </TouchableOpacity>
  )

  return (
    <ScrollView
      style={[styles.scrollView, isDark && styles.scrollViewDark]}
      keyboardShouldPersistTaps="handled"
    >
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

        <TouchableOpacity
          onPress={handleImportWallet}
          disabled={!walletName.trim() || !isValidSeedPhrase()}
          style={[
            styles.button,
            styles.primaryButton,
            (!walletName.trim() || !isValidSeedPhrase()) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>Import wallet</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  section: {
    position: 'relative', // For positioning the suggestions
  },
  input: {
    padding: 16,
    height: 48,
    borderRadius: 8,
    backgroundColor: alpha(colors.black, 0.05),
    color: colors.text.light,
  },
  inputDark: {
    color: colors.text.dark,
    backgroundColor: alpha(colors.white, 0.1),
  },
  seedInput: {
    padding: 16,
    minHeight: 120,
    borderRadius: 8,
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
})
