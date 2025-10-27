import colors from '@/ui/colors'
import {
  StyleSheet,
  useColorScheme,
  ScrollView,
  Text,
  View,
  Alert,
  TouchableOpacity,
} from 'react-native'
import { useSettings } from '@/features/storage'
import { useLightning } from '@/features/storage'
import { clearPersistedState } from '@/features/storage/StorageProvider'
import Picker from '@/ui/Picker/Picker'
import { ColorMode } from '@/models/settings'
import { LIGHTNING_SERVICE_PROVIDERS, DEFAULT_LSP } from '@/lib/lightning/constants'

// Import all iOS UI components
// import { Host, Button } from '@expo/ui/swift-ui'

export default function SettingsScreen() {
  const colorScheme = useColorScheme()
  const { colorMode, setColorMode, maxBlockchainSizeGB, setMaxBlockchainSize } = useSettings()
  const { spvEnabled, selectedLsp, setSelectedLsp } = useLightning()

  const effectiveColorMode = colorMode === 'auto' ? (colorScheme ?? 'light') : colorMode
  const isDarkEffective = effectiveColorMode === 'dark'

  const handleClearData = () => {
    Alert.alert(
      'Limpar Dados',
      'Isso irá limpar os dados persistidos da aplicação (MMKV). O estado atual será mantido até o próximo reinício do app. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: () => {
            // Clear persisted state from MMKV
            clearPersistedState()

            Alert.alert(
              'Dados Limpos',
              'Os dados persistidos foram limpos. Reinicie o aplicativo para ver as mudanças.',
            )
          },
        },
      ],
    )
  }

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

  // LSP options for SPV Lightning
  const lspOptions = [
    { label: `Auto (${LIGHTNING_SERVICE_PROVIDERS[DEFAULT_LSP].name})`, value: 'auto' },
    ...Object.entries(LIGHTNING_SERVICE_PROVIDERS).map(([id, config]) => ({
      label: `${config.name}${!config.isAvailable ? ' (Indisponível)' : ''}`,
      value: id,
    })),
  ]

  const selectedThemeIndex = themeOptions.findIndex(option => option.value === colorMode)
  const selectedSizeIndex = blockchainSizeOptions.findIndex(
    option => option.value === maxBlockchainSizeGB,
  )
  const selectedLspIndex = lspOptions.findIndex(option => option.value === selectedLsp)

  return (
    <ScrollView style={[styles.container, isDarkEffective && styles.containerDark]}>
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

      {spvEnabled && (
        <View style={styles.section}>
          <Text style={[styles.subtitle, isDarkEffective && styles.subtitleDark]}>
            Lightning Service Provider
          </Text>
          <Text style={[styles.description, isDarkEffective && styles.descriptionDark]}>
            Escolha o provedor para pagamentos Lightning SPV
          </Text>
          <View style={styles.settingRow}>
            <Picker
              options={lspOptions.map(opt => opt.label)}
              selectedIndex={selectedLspIndex}
              onOptionSelected={({ nativeEvent: { index } }) => {
                setSelectedLsp(lspOptions[index].value)
              }}
              variant="segmented"
            />
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.subtitle, isDarkEffective && styles.subtitleDark]}>
          Dados da Aplicação
        </Text>
        <TouchableOpacity
          style={[styles.clearButton, isDarkEffective && styles.clearButtonDark]}
          onPress={handleClearData}
        >
          <Text style={[styles.clearButtonText, isDarkEffective && styles.clearButtonTextDark]}>
            Limpar Dados Persistidos
          </Text>
        </TouchableOpacity>
        <Text style={[styles.description, isDarkEffective && styles.descriptionDark]}>
          Remove todos os dados salvos localmente (carteiras, configurações, etc.)
        </Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
  },
  containerDark: {
    backgroundColor: colors.background.dark,
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
  description: {
    fontSize: 16,
    color: colors.textSecondary.light,
    marginBottom: 15,
  },
  descriptionDark: {
    color: colors.textSecondary.dark,
  },
  clearButton: {
    backgroundColor: colors.error,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  clearButtonDark: {
    backgroundColor: colors.error,
  },
  clearButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearButtonTextDark: {
    color: colors.white,
  },
})
