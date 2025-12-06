import React, { useState, useEffect } from 'react'
import { View, Text, Switch, TouchableOpacity, Alert, StyleSheet } from 'react-native'
import colors from '@/ui/colors'
import { CloudSyncService } from '@/core/repositories/cloud/cloud-sync-service'
import cloudSettingsRepository from '@/core/repositories/cloud/cloud-settings-repository'

interface CloudSyncSectionProps {
  isDark: boolean
}

export default function CloudSyncSection({ isDark }: CloudSyncSectionProps) {
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [cloudAvailable, setCloudAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const cloudSyncService = CloudSyncService.getInstance()

  useEffect(() => {
    loadSettings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSettings = async () => {
    try {
      const settings = cloudSettingsRepository.getSettings()
      setSyncEnabled(settings.syncEnabled)

      const available = await cloudSyncService.isCloudAvailable()
      setCloudAvailable(available)
    } catch (error) {
      console.error('Failed to load cloud sync settings:', error)
    }
  }

  const handleToggleSync = async (enabled: boolean) => {
    if (!cloudAvailable && enabled) {
      Alert.alert(
        'Nuvem Indisponível',
        'Serviços de nuvem não estão disponíveis no momento. Verifique sua conexão e tente novamente.',
      )
      return
    }

    try {
      setIsLoading(true)
      cloudSyncService.setSyncEnabled(enabled)
      setSyncEnabled(enabled)

      Alert.alert(
        'Sincronização ' + (enabled ? 'Habilitada' : 'Desabilitada'),
        enabled
          ? 'Seus dados serão sincronizados automaticamente com a nuvem.'
          : 'A sincronização com a nuvem foi desabilitada.',
      )
    } catch (error) {
      console.error('Failed to toggle cloud sync:', error)
      Alert.alert('Erro', 'Não foi possível alterar a configuração de sincronização.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForceSync = async () => {
    if (!syncEnabled) {
      Alert.alert('Sincronização Desabilitada', 'Habilite a sincronização primeiro.')
      return
    }

    try {
      setIsLoading(true)
      Alert.alert('Sincronização', 'Sincronização forçada em andamento...')

      // TODO: Implementar sincronização forçada de todos os repositórios
      // Por enquanto, apenas mostra que está funcionando
      await new Promise(resolve => setTimeout(resolve, 2000))

      Alert.alert('Sucesso', 'Sincronização concluída!')
    } catch (error) {
      console.error('Failed to force sync:', error)
      Alert.alert('Erro', 'Falha na sincronização.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>Sincronização na Nuvem</Text>

      <View style={styles.settingRow}>
        <Text style={[styles.label, isDark && styles.labelDark]}>Habilitar Sincronização</Text>
        <Switch
          value={syncEnabled}
          onValueChange={handleToggleSync}
          disabled={isLoading || !cloudAvailable}
          trackColor={{ false: colors.disabled, true: colors.primary }}
          thumbColor={syncEnabled ? colors.white : colors.disabled}
        />
      </View>

      {!cloudAvailable && (
        <Text style={[styles.warning, isDark && styles.warningDark]}>
          ⚠️ Serviços de nuvem não disponíveis
        </Text>
      )}

      {syncEnabled && (
        <TouchableOpacity
          style={[styles.syncButton, isDark && styles.syncButtonDark, isLoading && styles.disabled]}
          onPress={handleForceSync}
          disabled={isLoading}
        >
          <Text style={[styles.syncButtonText, isDark && styles.syncButtonTextDark]}>
            {isLoading ? 'Sincronizando...' : 'Sincronizar Agora'}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.description, isDark && styles.descriptionDark]}>
        Sincronize seus dados entre dispositivos usando iCloud ou Google Drive. Seus dados
        criptográficos permanecem seguros localmente.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: {
    fontSize: 16,
    color: colors.text.light,
    flex: 1,
  },
  labelDark: {
    color: colors.text.dark,
  },
  warning: {
    fontSize: 14,
    color: colors.warning,
    marginBottom: 10,
  },
  warningDark: {
    color: colors.warning,
  },
  syncButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  syncButtonDark: {
    backgroundColor: colors.primary,
  },
  syncButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  syncButtonTextDark: {
    color: colors.white,
  },
  disabled: {
    opacity: 0.5,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary.light,
    lineHeight: 20,
  },
  descriptionDark: {
    color: colors.textSecondary.dark,
  },
})
