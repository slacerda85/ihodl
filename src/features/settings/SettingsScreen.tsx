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
// import { clearPersistedState } from '@/features/storage/StorageProvider'
import Picker from '@/ui/components/Picker/Picker'
import AccountRepository from '@/core/repositories/account'
import SeedRepository from '@/core/repositories/seed'
import walletRepository from '@/core/repositories/wallet'
// import { ColorMode } from './state'
// import LightningSection from './LightningSection'

export default function SettingsScreen() {
  const colorScheme = useColorScheme()
  const { colorMode, maxBlockchainSizeGB } = useSettings()

  const effectiveColorMode = colorMode === 'auto' ? (colorScheme ?? 'light') : colorMode
  const isDarkEffective = effectiveColorMode === 'dark'

  const handleClearWallets = () => {
    Alert.alert(
      'Limpar Carteiras',
      'Isso irá limpar todas as carteiras salvas. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: () => {
            walletRepository.clear()
            Alert.alert('Carteiras Limpas', 'Todas as carteiras foram removidas.')
          },
        },
      ],
    )
  }

  const handleClearSeeds = () => {
    Alert.alert('Limpar Seeds', 'Isso irá limpar todas as seeds salvas. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: () => {
          const seedRepository = new SeedRepository()
          seedRepository.clear()
          Alert.alert('Seeds Limpas', 'Todas as seeds foram removidas.')
        },
      },
    ])
  }

  const handleClearAccounts = () => {
    Alert.alert('Limpar Contas', 'Isso irá limpar todas as contas salvas. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: () => {
          const accountRepository = new AccountRepository()
          accountRepository.clear()
          Alert.alert('Contas Limpas', 'Todas as contas foram removidas.')
        },
      },
    ])
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
          onPress={handleClearWallets}
        >
          <Text style={[styles.clearButtonText, isDarkEffective && styles.clearButtonTextDark]}>
            Limpar Carteiras
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.clearButton, isDarkEffective && styles.clearButtonDark]}
          onPress={handleClearSeeds}
        >
          <Text style={[styles.clearButtonText, isDarkEffective && styles.clearButtonTextDark]}>
            Limpar Seeds
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.clearButton, isDarkEffective && styles.clearButtonDark]}
          onPress={handleClearAccounts}
        >
          <Text style={[styles.clearButtonText, isDarkEffective && styles.clearButtonTextDark]}>
            Limpar Contas
          </Text>
        </TouchableOpacity>
        <Text style={[styles.description, isDarkEffective && styles.descriptionDark]}>
          Use os botões acima para limpar dados específicos salvos localmente.
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
