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
import { useSettings } from '@/features/settings'
import { clearPersistedState } from '@/features/storage/StorageProvider'
import Picker from '@/ui/Picker/Picker'
// import { ColorMode } from './state'
// import LightningSection from './LightningSection'

export default function SettingsScreen() {
  const colorScheme = useColorScheme()
  const { colorMode, maxBlockchainSizeGB } = useSettings()

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

  const selectedThemeIndex = themeOptions.findIndex(option => option.value === colorMode)
  const selectedSizeIndex = blockchainSizeOptions.findIndex(
    option => option.value === maxBlockchainSizeGB,
  )

  return (
    <ScrollView style={[styles.container, isDarkEffective && styles.containerDark]}>
      <View style={styles.section}>
        <Text style={[styles.subtitle, isDarkEffective && styles.subtitleDark]}>Tema</Text>
        <View style={styles.settingRow}>
          <Picker
            options={['Claro', 'Escuro', 'Automático']}
            selectedIndex={selectedThemeIndex}
            /* onOptionSelected={({ nativeEvent: { index } }) => {
              setColorMode(themeOptions[index].value as ColorMode)
            }} */
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
            /* onOptionSelected={({ nativeEvent: { index } }) => {
              setMaxBlockchainSize(blockchainSizeOptions[index].value)
            }} */
            variant="segmented"
          />
        </View>
      </View>

      <View style={styles.section}>{/* <LightningSection isDark={isDarkEffective} /> */}</View>

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
    // backgroundColor: 'red',
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
    // marginBottom: 15,
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
