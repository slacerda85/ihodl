import colors from '@/ui/colors'
import { StyleSheet, useColorScheme, ScrollView, Text, View } from 'react-native'
import { useSettings } from '@/features/store'
import Picker from '@/ui/Picker'
import { ColorMode } from '@/models/settings'

// Import all iOS UI components
import { Host, Button } from '@expo/ui/swift-ui'

export default function SettingsScreen() {
  const colorScheme = useColorScheme()
  const { colorMode, setColorMode, maxBlockchainSizeGB, setMaxBlockchainSize } = useSettings()

  const effectiveColorMode = colorMode === 'auto' ? (colorScheme ?? 'light') : colorMode
  const isDarkEffective = effectiveColorMode === 'dark'

  const themeOptions = [
    { label: 'Claro', value: 'light' },
    { label: 'Escuro', value: 'dark' },
    { label: 'Automático', value: 'auto' },
  ]

  const blockchainSizeOptions = [
    { label: '0.5 GB', value: 0.5 },
    { label: '1 GB', value: 1 },
    { label: '2 GB', value: 2 },
    { label: '5 GB', value: 5 },
  ]

  const selectedThemeIndex = themeOptions.findIndex(option => option.value === colorMode)
  const selectedSizeIndex = blockchainSizeOptions.findIndex(
    option => option.value === maxBlockchainSizeGB,
  )

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={[styles.subtitle, isDarkEffective && styles.subtitleDark]}>Tema</Text>
        <View style={styles.settingRow}>
          <Picker
            options={['Claro', 'Escuro', 'Automático']}
            selectedIndex={selectedThemeIndex}
            onOptionSelected={({ nativeEvent: { index } }) => {
              setColorMode(themeOptions[index].value as ColorMode)
            }}
            variant="segmented"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.subtitle, isDarkEffective && styles.subtitleDark]}>
          Tamanho máximo da Blockchain
        </Text>
        <View style={styles.settingRow}>
          <Picker
            options={['0.5 GB', '1 GB', '2 GB', '5 GB']}
            selectedIndex={selectedSizeIndex}
            onOptionSelected={({ nativeEvent: { index } }) => {
              setMaxBlockchainSize(blockchainSizeOptions[index].value)
            }}
            variant="segmented"
          />
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
  },
  section: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 20,
  },
  titleDark: {
    color: colors.text.dark,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  label: {
    fontSize: 18,
    color: colors.text.light,
    marginRight: 15,
    minWidth: 60,
  },
  labelDark: {
    color: colors.text.dark,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
    marginBottom: 15,
  },
  subtitleDark: {
    color: colors.textSecondary.dark,
  },
})
