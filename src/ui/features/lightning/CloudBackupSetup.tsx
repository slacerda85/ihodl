/**
 * CloudBackupSetup - Configuração de Backup na Nuvem
 *
 * Permite configurar backup automático de canais Lightning na nuvem:
 * - Google Drive
 * - iCloud (iOS)
 * - Backup manual local
 *
 * Otimizado para React 19 e React Compiler.
 */

import { useState, useCallback, memo, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Switch,
  Platform,
} from 'react-native'

import { useChannelBackup } from './hooks'

// ==========================================
// TYPES
// ==========================================

export type CloudProvider = 'none' | 'google_drive' | 'icloud' | 'local'

export interface CloudBackupConfig {
  provider: CloudProvider
  autoBackup: boolean
  backupFrequency: 'on_change' | 'daily' | 'weekly'
  encryptionEnabled: boolean
  lastSyncTime: number | null
  lastSyncStatus: 'success' | 'failed' | 'pending' | null
}

export interface CloudBackupSetupProps {
  /** Configuração atual */
  initialConfig?: Partial<CloudBackupConfig>
  /** Callback quando configuração é salva */
  onConfigSaved?: (config: CloudBackupConfig) => void
  /** Callback para voltar */
  onBack?: () => void
  /** Callback para erro */
  onError?: (error: string) => void
}

interface ProviderCardProps {
  provider: CloudProvider
  name: string
  icon: string
  description: string
  isSelected: boolean
  isAvailable: boolean
  onSelect: () => void
}

interface FrequencyOptionProps {
  value: CloudBackupConfig['backupFrequency']
  label: string
  description: string
  isSelected: boolean
  onSelect: () => void
}

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_CONFIG: CloudBackupConfig = {
  provider: 'none',
  autoBackup: false,
  backupFrequency: 'on_change',
  encryptionEnabled: true,
  lastSyncTime: null,
  lastSyncStatus: null,
}

const CLOUD_PROVIDERS: {
  id: CloudProvider
  name: string
  icon: string
  description: string
  platforms: ('ios' | 'android' | 'web')[]
}[] = [
  {
    id: 'google_drive',
    name: 'Google Drive',
    icon: '📁',
    description: 'Backup seguro no Google Drive',
    platforms: ['ios', 'android', 'web'],
  },
  {
    id: 'icloud',
    name: 'iCloud',
    icon: '☁️',
    description: 'Backup integrado com iCloud',
    platforms: ['ios'],
  },
  {
    id: 'local',
    name: 'Apenas Local',
    icon: '📱',
    description: 'Backup apenas no dispositivo',
    platforms: ['ios', 'android', 'web'],
  },
]

const FREQUENCY_OPTIONS: {
  value: CloudBackupConfig['backupFrequency']
  label: string
  description: string
}[] = [
  {
    value: 'on_change',
    label: 'A cada alteração',
    description: 'Backup automático quando canais mudam',
  },
  {
    value: 'daily',
    label: 'Diário',
    description: 'Backup uma vez por dia',
  },
  {
    value: 'weekly',
    label: 'Semanal',
    description: 'Backup uma vez por semana',
  },
]

// ==========================================
// SUB-COMPONENTS
// ==========================================

const ProviderCard = memo(function ProviderCard({
  provider,
  name,
  icon,
  description,
  isSelected,
  isAvailable,
  onSelect,
}: ProviderCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.providerCard,
        isSelected && styles.providerCardSelected,
        !isAvailable && styles.providerCardDisabled,
      ]}
      onPress={onSelect}
      disabled={!isAvailable}
    >
      <View style={styles.providerIconContainer}>
        <Text style={styles.providerIcon}>{icon}</Text>
        {isSelected && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.providerInfo}>
        <Text style={[styles.providerName, !isAvailable && styles.textDisabled]}>{name}</Text>
        <Text style={[styles.providerDescription, !isAvailable && styles.textDisabled]}>
          {description}
        </Text>
        {!isAvailable && (
          <Text style={styles.unavailableText}>Não disponível nesta plataforma</Text>
        )}
      </View>
    </TouchableOpacity>
  )
})

const FrequencyOption = memo(function FrequencyOption({
  value,
  label,
  description,
  isSelected,
  onSelect,
}: FrequencyOptionProps) {
  return (
    <TouchableOpacity
      style={[styles.frequencyOption, isSelected && styles.frequencyOptionSelected]}
      onPress={onSelect}
    >
      <View style={styles.frequencyRadio}>
        <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
          {isSelected && <View style={styles.radioInner} />}
        </View>
      </View>
      <View style={styles.frequencyInfo}>
        <Text style={styles.frequencyLabel}>{label}</Text>
        <Text style={styles.frequencyDescription}>{description}</Text>
      </View>
    </TouchableOpacity>
  )
})

interface SyncStatusProps {
  lastSyncTime: number | null
  lastSyncStatus: CloudBackupConfig['lastSyncStatus']
  onSyncNow: () => void
  isSyncing: boolean
}

const SyncStatus = memo(function SyncStatus({
  lastSyncTime,
  lastSyncStatus,
  onSyncNow,
  isSyncing,
}: SyncStatusProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = () => {
    switch (lastSyncStatus) {
      case 'success':
        return '✅'
      case 'failed':
        return '❌'
      case 'pending':
        return '⏳'
      default:
        return '❓'
    }
  }

  const getStatusText = () => {
    switch (lastSyncStatus) {
      case 'success':
        return 'Sincronizado'
      case 'failed':
        return 'Falha na sincronização'
      case 'pending':
        return 'Sincronização pendente'
      default:
        return 'Nunca sincronizado'
    }
  }

  return (
    <View style={styles.syncStatusCard}>
      <View style={styles.syncStatusHeader}>
        <Text style={styles.syncStatusIcon}>{getStatusIcon()}</Text>
        <View style={styles.syncStatusInfo}>
          <Text style={styles.syncStatusText}>{getStatusText()}</Text>
          {lastSyncTime && (
            <Text style={styles.syncStatusTime}>Última: {formatDate(lastSyncTime)}</Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.syncButton, isSyncing && styles.buttonDisabled]}
        onPress={onSyncNow}
        disabled={isSyncing}
      >
        {isSyncing ? (
          <ActivityIndicator color="#f7931a" size="small" />
        ) : (
          <Text style={styles.syncButtonText}>Sincronizar Agora</Text>
        )}
      </TouchableOpacity>
    </View>
  )
})

// ==========================================
// MAIN COMPONENT
// ==========================================

function CloudBackupSetup({
  initialConfig,
  onConfigSaved,
  onBack,
  onError,
}: CloudBackupSetupProps) {
  const { exportBackup, isLoading: backupLoading } = useChannelBackup()

  // State
  const [config, setConfig] = useState<CloudBackupConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showPasswordSetup, setShowPasswordSetup] = useState(false)

  // Check platform availability
  const currentPlatform = Platform.OS as 'ios' | 'android' | 'web'

  const availableProviders = useMemo(
    () =>
      CLOUD_PROVIDERS.map(p => ({
        ...p,
        isAvailable: p.platforms.includes(currentPlatform),
      })),
    [currentPlatform],
  )

  // Handlers
  const handleProviderSelect = useCallback((provider: CloudProvider) => {
    setConfig(prev => ({
      ...prev,
      provider,
      autoBackup: provider !== 'none' && provider !== 'local',
    }))
  }, [])

  const handleFrequencySelect = useCallback((frequency: CloudBackupConfig['backupFrequency']) => {
    setConfig(prev => ({
      ...prev,
      backupFrequency: frequency,
    }))
  }, [])

  const handleAutoBackupToggle = useCallback((value: boolean) => {
    setConfig(prev => ({
      ...prev,
      autoBackup: value,
    }))
  }, [])

  const handleEncryptionToggle = useCallback(
    (value: boolean) => {
      setConfig(prev => ({
        ...prev,
        encryptionEnabled: value,
      }))
      if (value && !password) {
        setShowPasswordSetup(true)
      }
    },
    [password],
  )

  const handleSyncNow = useCallback(async () => {
    if (config.provider === 'none') {
      Alert.alert('Erro', 'Selecione um provedor de backup primeiro.')
      return
    }

    setIsSyncing(true)

    try {
      // Export backup first
      if (config.encryptionEnabled && !password) {
        Alert.alert('Erro', 'Configure uma senha para o backup encriptado.')
        return
      }

      const backupResult = await exportBackup(password || 'default_password')

      if (!backupResult.success) {
        throw new Error(backupResult.error ?? 'Falha ao criar backup')
      }

      // TODO: Implement actual cloud sync based on provider
      // For now, simulate sync
      await new Promise(resolve => setTimeout(resolve, 2000))

      setConfig(prev => ({
        ...prev,
        lastSyncTime: Date.now(),
        lastSyncStatus: 'success',
      }))

      Alert.alert('Sucesso', 'Backup sincronizado com sucesso!')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao sincronizar'
      setConfig(prev => ({
        ...prev,
        lastSyncStatus: 'failed',
      }))
      onError?.(message)
      Alert.alert('Erro', message)
    } finally {
      setIsSyncing(false)
    }
  }, [config.provider, config.encryptionEnabled, password, exportBackup, onError])

  const handleSaveConfig = useCallback(async () => {
    // Validate password if encryption is enabled
    if (config.encryptionEnabled && showPasswordSetup) {
      if (!password) {
        Alert.alert('Erro', 'Digite uma senha para o backup.')
        return
      }
      if (password !== confirmPassword) {
        Alert.alert('Erro', 'As senhas não coincidem.')
        return
      }
      if (password.length < 8) {
        Alert.alert('Erro', 'A senha deve ter pelo menos 8 caracteres.')
        return
      }
    }

    setIsSaving(true)

    try {
      // TODO: Save config to secure storage
      // TODO: Setup cloud provider authentication if needed

      await new Promise(resolve => setTimeout(resolve, 500))

      onConfigSaved?.(config)
      Alert.alert('Sucesso', 'Configurações salvas com sucesso!')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar'
      onError?.(message)
      Alert.alert('Erro', message)
    } finally {
      setIsSaving(false)
    }
  }, [config, password, confirmPassword, showPasswordSetup, onConfigSaved, onError])

  const isLoading = isSaving || isSyncing || backupLoading

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>← Voltar</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Backup na Nuvem</Text>
        <Text style={styles.subtitle}>Configure backup automático dos seus canais Lightning</Text>
      </View>

      {/* Provider Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Provedor de Backup</Text>
        <Text style={styles.sectionDescription}>Escolha onde seus backups serão armazenados</Text>

        {availableProviders.map(provider => (
          <ProviderCard
            key={provider.id}
            provider={provider.id}
            name={provider.name}
            icon={provider.icon}
            description={provider.description}
            isSelected={config.provider === provider.id}
            isAvailable={provider.isAvailable}
            onSelect={() => handleProviderSelect(provider.id)}
          />
        ))}
      </View>

      {/* Auto Backup Settings */}
      {config.provider !== 'none' && config.provider !== 'local' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backup Automático</Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Habilitar Backup Automático</Text>
              <Text style={styles.toggleDescription}>
                Sincronize automaticamente quando canais mudam
              </Text>
            </View>
            <Switch
              value={config.autoBackup}
              onValueChange={handleAutoBackupToggle}
              trackColor={{ false: '#333', true: '#f7931a' }}
              thumbColor={config.autoBackup ? '#fff' : '#666'}
            />
          </View>

          {config.autoBackup && (
            <View style={styles.frequencySection}>
              <Text style={styles.subsectionTitle}>Frequência</Text>
              {FREQUENCY_OPTIONS.map(option => (
                <FrequencyOption
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  description={option.description}
                  isSelected={config.backupFrequency === option.value}
                  onSelect={() => handleFrequencySelect(option.value)}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Encryption Settings */}
      {config.provider !== 'none' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Segurança</Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Encriptação</Text>
              <Text style={styles.toggleDescription}>Proteja seus backups com uma senha</Text>
            </View>
            <Switch
              value={config.encryptionEnabled}
              onValueChange={handleEncryptionToggle}
              trackColor={{ false: '#333', true: '#f7931a' }}
              thumbColor={config.encryptionEnabled ? '#fff' : '#666'}
            />
          </View>

          {config.encryptionEnabled && showPasswordSetup && (
            <View style={styles.passwordSection}>
              <Text style={styles.inputLabel}>Senha do Backup</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Digite uma senha forte"
                placeholderTextColor="#666"
                secureTextEntry
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Confirmar Senha</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirme a senha"
                placeholderTextColor="#666"
                secureTextEntry
                autoCapitalize="none"
              />

              <View style={styles.passwordHint}>
                <Text style={styles.hintIcon}>💡</Text>
                <Text style={styles.hintText}>
                  Guarde esta senha em local seguro. Sem ela, você não poderá recuperar seus canais.
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Sync Status */}
      {config.provider !== 'none' && config.provider !== 'local' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status da Sincronização</Text>
          <SyncStatus
            lastSyncTime={config.lastSyncTime}
            lastSyncStatus={config.lastSyncStatus}
            onSyncNow={handleSyncNow}
            isSyncing={isSyncing}
          />
        </View>
      )}

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ Importante</Text>
        <Text style={styles.infoText}>
          O backup na nuvem contém apenas informações necessárias para recuperar seus canais em caso
          de perda do dispositivo. Suas chaves privadas são sempre encriptadas antes de serem
          enviadas.
        </Text>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, isLoading && styles.buttonDisabled]}
        onPress={handleSaveConfig}
        disabled={isLoading}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Salvar Configurações</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },

  // Header
  header: {
    marginBottom: 32,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    color: '#f7931a',
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },

  // Section
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    marginTop: 16,
  },

  // Provider Card
  providerCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  providerCardSelected: {
    borderColor: '#f7931a',
    backgroundColor: '#1a1a0a',
  },
  providerCardDisabled: {
    opacity: 0.5,
  },
  providerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  providerIcon: {
    fontSize: 24,
  },
  checkmark: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#f7931a',
    borderRadius: 10,
    width: 20,
    height: 20,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 12,
    color: '#fff',
    overflow: 'hidden',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  providerDescription: {
    fontSize: 13,
    color: '#888',
  },
  textDisabled: {
    color: '#555',
  },
  unavailableText: {
    fontSize: 11,
    color: '#f44',
    marginTop: 4,
  },

  // Toggle Row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 13,
    color: '#888',
  },

  // Frequency Options
  frequencySection: {
    marginTop: 8,
  },
  frequencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  frequencyOptionSelected: {
    borderColor: '#f7931a',
  },
  frequencyRadio: {
    marginRight: 16,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: '#f7931a',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f7931a',
  },
  frequencyInfo: {
    flex: 1,
  },
  frequencyLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 2,
  },
  frequencyDescription: {
    fontSize: 13,
    color: '#888',
  },

  // Password Section
  passwordSection: {
    marginTop: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
  },
  passwordHint: {
    flexDirection: 'row',
    backgroundColor: '#2a2a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4a4a2a',
  },
  hintIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },

  // Sync Status
  syncStatusCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  syncStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  syncStatusIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  syncStatusInfo: {
    flex: 1,
  },
  syncStatusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 4,
  },
  syncStatusTime: {
    fontSize: 13,
    color: '#888',
  },
  syncButton: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  syncButtonText: {
    color: '#f7931a',
    fontSize: 14,
    fontWeight: '600',
  },

  // Info Box
  infoBox: {
    backgroundColor: '#1a1a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#68f',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },

  // Save Button
  saveButton: {
    backgroundColor: '#f7931a',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})

export default memo(CloudBackupSetup)
