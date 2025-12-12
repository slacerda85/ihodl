import colors from '@/ui/colors'
import { StyleSheet, ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native'
import { useActiveColorMode } from '@/ui/features/app-provider'
import SeedRepository from '@/core/repositories/seed'
import { walletService } from '@/core/services'
import LightningSettingsSection from './LightningSettingsSection'
import CloudSyncSection from './CloudSyncSection'
import LightningDebugPanel from '../lightning/components/LightningDebugPanel'

export default function SettingsScreen() {
  const colorMode = useActiveColorMode()

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
            walletService.clear()
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
          const seedRepository = SeedRepository
          seedRepository.clear()
          Alert.alert('Seeds Limpas', 'Todas as seeds foram removidas.')
        },
      },
    ])
  }

  return (
    <ScrollView style={styles[colorMode].container}>
      {__DEV__ && (
        <View style={styles[colorMode].section}>
          <LightningDebugPanel />
        </View>
      )}
      <View style={styles[colorMode].section}>
        <Text style={styles[colorMode].subtitle}>Tema</Text>
        <View style={styles[colorMode].settingRow}>
          {/* <Picker
            options={['Claro', 'Escuro', 'Automático']}
            selectedIndex={selectedThemeIndex}
            
            variant="segmented"
          /> */}
        </View>
      </View>

      <View style={styles[colorMode].section}>
        <Text style={styles[colorMode].subtitle}>Tamanho máximo da Blockchain</Text>
        <View style={styles[colorMode].settingRow}>
          {/* <Picker
            options={['0.5 GB', '1 GB', '2 GB', '5 GB']}
            selectedIndex={selectedSizeIndex}
            
            variant="segmented"
          /> */}
        </View>
      </View>

      <View style={styles[colorMode].section}>
        <LightningSettingsSection isDark={colorMode === 'dark'} />
      </View>

      <View style={styles[colorMode].section}>
        <CloudSyncSection isDark={colorMode === 'dark'} />
      </View>

      <View style={styles[colorMode].section}>
        <Text style={styles[colorMode].subtitle}>Dados da Aplicação</Text>
        <TouchableOpacity style={styles[colorMode].clearButton} onPress={handleClearWallets}>
          <Text style={styles[colorMode].clearButtonText}>Limpar Carteiras</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles[colorMode].clearButton} onPress={handleClearSeeds}>
          <Text style={styles[colorMode].clearButtonText}>Limpar Seeds</Text>
        </TouchableOpacity>
        {/* <TouchableOpacity
          style={[styles.clearButton, isDarkEffective && styles.clearButtonDark]}
          onPress={handleClearAccounts}
        >
          <Text style={[styles.clearButtonText, isDarkEffective && styles.clearButtonTextDark]}>
            Limpar Contas
          </Text>
        </TouchableOpacity> */}
        <Text style={styles[colorMode].description}>
          Use os botões acima para limpar dados específicos salvos localmente.
        </Text>
      </View>
    </ScrollView>
  )
}

const light = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.light,
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
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
    marginBottom: 15,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary.light,
    marginBottom: 15,
  },
  clearButton: {
    backgroundColor: colors.error,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  clearButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
})

const dark: typeof light = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.dark,
  },
  section: {
    // backgroundColor: 'red',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text.dark,
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // marginBottom: 15,
  },
  label: {
    fontSize: 18,
    color: colors.text.dark,
    marginRight: 15,
    minWidth: 60,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textSecondary.dark,
    marginBottom: 15,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary.dark,
    marginBottom: 15,
  },
  clearButton: {
    backgroundColor: colors.error,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  clearButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
})

const styles = { light, dark }
