/**
 * BackupSettings - Configurações de Backup de Canais Lightning
 *
 * Permite gerenciar backups de canais:
 * - Criar backup manual
 * - Exportar backup encriptado
 * - Importar backup existente
 * - Visualizar status do backup
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
  Share,
} from 'react-native'

import { useChannelBackup } from './hooks'
import { useLightningChannels } from './hooks'

// ==========================================
// TYPES
// ==========================================

interface BackupSettingsProps {
  /** Callback quando backup é criado */
  onBackupCreated?: () => void
  /** Callback quando backup é exportado */
  onBackupExported?: (data: string) => void
  /** Callback quando backup é importado */
  onBackupImported?: () => void
  /** Callback para erro */
  onError?: (error: string) => void
}

type ModalType = 'none' | 'export' | 'import'

// ==========================================
// SUB-COMPONENTS
// ==========================================

interface BackupStatusCardProps {
  lastBackupTime: number | null
  channelCount: number
  hasUnsavedChanges: boolean
}

const BackupStatusCard = memo(function BackupStatusCard({
  lastBackupTime,
  channelCount,
  hasUnsavedChanges,
}: BackupStatusCardProps) {
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

  return (
    <View style={styles.statusCard}>
      <View style={styles.statusHeader}>
        <Text style={styles.statusIcon}>
          {hasUnsavedChanges ? '⚠️' : lastBackupTime ? '✅' : '❌'}
        </Text>
        <Text style={styles.statusTitle}>Status do Backup</Text>
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Último backup</Text>
        <Text style={styles.statusValue}>
          {lastBackupTime ? formatDate(lastBackupTime) : 'Nunca'}
        </Text>
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Canais salvos</Text>
        <Text style={styles.statusValue}>{channelCount}</Text>
      </View>

      {hasUnsavedChanges && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>Há alterações não salvas. Crie um novo backup.</Text>
        </View>
      )}
    </View>
  )
})

interface ActionButtonProps {
  icon: string
  label: string
  sublabel?: string
  onPress: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}

const ActionButton = memo(function ActionButton({
  icon,
  label,
  sublabel,
  onPress,
  disabled,
  variant = 'secondary',
}: ActionButtonProps) {
  const buttonStyle = [
    styles.actionButton,
    variant === 'primary' && styles.actionButtonPrimary,
    variant === 'danger' && styles.actionButtonDanger,
    disabled && styles.actionButtonDisabled,
  ]

  const textStyle = [
    styles.actionButtonLabel,
    variant === 'primary' && styles.actionButtonLabelPrimary,
    variant === 'danger' && styles.actionButtonLabelDanger,
  ]

  return (
    <TouchableOpacity style={buttonStyle} onPress={onPress} disabled={disabled}>
      <Text style={styles.actionButtonIcon}>{icon}</Text>
      <View style={styles.actionButtonTextContainer}>
        <Text style={textStyle}>{label}</Text>
        {sublabel && <Text style={styles.actionButtonSublabel}>{sublabel}</Text>}
      </View>
    </TouchableOpacity>
  )
})

interface PasswordModalProps {
  visible: boolean
  title: string
  onConfirm: (password: string) => void
  onCancel: () => void
  isLoading?: boolean
  confirmLabel?: string
  showConfirmPassword?: boolean
}

const PasswordModal = memo(function PasswordModal({
  visible,
  title,
  onConfirm,
  onCancel,
  isLoading,
  confirmLabel = 'Confirmar',
  showConfirmPassword = false,
}: PasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = useCallback(() => {
    if (password.length < 8) {
      setError('Senha deve ter pelo menos 8 caracteres')
      return
    }

    if (showConfirmPassword && password !== confirmPassword) {
      setError('Senhas não conferem')
      return
    }

    setError(null)
    onConfirm(password)
    setPassword('')
    setConfirmPassword('')
  }, [password, confirmPassword, showConfirmPassword, onConfirm])

  const handleCancel = useCallback(() => {
    setPassword('')
    setConfirmPassword('')
    setError(null)
    onCancel()
  }, [onCancel])

  if (!visible) return null

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder="Digite sua senha"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!isLoading}
          />
        </View>

        {showConfirmPassword && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirmar Senha</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirme sua senha"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!isLoading}
            />
          </View>
        )}

        {error && <Text style={styles.modalError}>{error}</Text>}

        <View style={styles.modalButtons}>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonCancel]}
            onPress={handleCancel}
            disabled={isLoading}
          >
            <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonConfirm]}
            onPress={handleConfirm}
            disabled={isLoading || password.length < 8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalButtonText}>{confirmLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
})

interface ImportModalProps {
  visible: boolean
  onImport: (data: string, password: string) => void
  onCancel: () => void
  isLoading?: boolean
}

const ImportModal = memo(function ImportModal({
  visible,
  onImport,
  onCancel,
  isLoading,
}: ImportModalProps) {
  const [backupData, setBackupData] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleImport = useCallback(() => {
    if (!backupData.trim()) {
      setError('Cole os dados do backup')
      return
    }
    if (password.length < 8) {
      setError('Senha deve ter pelo menos 8 caracteres')
      return
    }

    setError(null)
    onImport(backupData.trim(), password)
  }, [backupData, password, onImport])

  const handleCancel = useCallback(() => {
    setBackupData('')
    setPassword('')
    setError(null)
    onCancel()
  }, [onCancel])

  if (!visible) return null

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Importar Backup</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Dados do Backup</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Cole aqui os dados do backup..."
            multiline
            numberOfLines={4}
            value={backupData}
            onChangeText={setBackupData}
            editable={!isLoading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Senha do Backup</Text>
          <TextInput
            style={styles.input}
            placeholder="Digite a senha usada na exportação"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!isLoading}
          />
        </View>

        {error && <Text style={styles.modalError}>{error}</Text>}

        <View style={styles.modalButtons}>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonCancel]}
            onPress={handleCancel}
            disabled={isLoading}
          >
            <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonConfirm]}
            onPress={handleImport}
            disabled={isLoading || !backupData.trim()}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalButtonText}>Importar</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
})

// ==========================================
// MAIN COMPONENT
// ==========================================

function BackupSettings({
  onBackupCreated,
  onBackupExported,
  onBackupImported,
  onError,
}: BackupSettingsProps) {
  const {
    backupState,
    isLoading,
    error: backupError,
    createBackup,
    exportBackup,
    importBackup,
  } = useChannelBackup()

  const channels = useLightningChannels()

  // Estados locais
  const [activeModal, setActiveModal] = useState<ModalType>('none')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Estatísticas
  const stats = useMemo(
    () => ({
      totalChannels: channels?.length || 0,
      backedUpChannels: backupState.currentBackup?.channels.length || 0,
      lastBackupTime: backupState.lastBackupTime,
      hasUnsavedChanges: backupState.hasUnsavedChanges,
    }),
    [channels, backupState],
  )

  // Handlers
  const handleCreateBackup = useCallback(async () => {
    const backup = await createBackup()
    if (backup) {
      setSuccessMessage('Backup criado com sucesso!')
      onBackupCreated?.()
      setTimeout(() => setSuccessMessage(null), 3000)
    } else {
      onError?.(backupError || 'Erro ao criar backup')
    }
  }, [createBackup, backupError, onBackupCreated, onError])

  const handleExport = useCallback(
    async (password: string) => {
      const result = await exportBackup(password)
      setActiveModal('none')

      if (result.success && result.data) {
        try {
          await Share.share({
            message: result.data,
            title: 'Backup de Canais Lightning',
          })
          onBackupExported?.(result.data)
          setSuccessMessage('Backup exportado!')
          setTimeout(() => setSuccessMessage(null), 3000)
        } catch {
          // User cancelled share
        }
      } else {
        onError?.(result.error || 'Erro ao exportar')
        Alert.alert('Erro', result.error || 'Erro ao exportar backup')
      }
    },
    [exportBackup, onBackupExported, onError],
  )

  const handleImport = useCallback(
    async (data: string, password: string) => {
      const result = await importBackup(data, password)
      setActiveModal('none')

      if (result.success) {
        setSuccessMessage(result.data || 'Backup importado!')
        onBackupImported?.()
        setTimeout(() => setSuccessMessage(null), 3000)
      } else {
        onError?.(result.error || 'Erro ao importar')
        Alert.alert('Erro', result.error || 'Erro ao importar backup')
      }
    },
    [importBackup, onBackupImported, onError],
  )

  const openExportModal = useCallback(() => {
    if (!backupState.currentBackup || backupState.currentBackup.channels.length === 0) {
      Alert.alert('Sem Backup', 'Crie um backup primeiro antes de exportar.', [{ text: 'OK' }])
      return
    }
    setActiveModal('export')
  }, [backupState.currentBackup])

  const openImportModal = useCallback(() => {
    setActiveModal('import')
  }, [])

  const closeModal = useCallback(() => {
    setActiveModal('none')
  }, [])

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Backup de Canais</Text>
      <Text style={styles.subtitle}>Mantenha seus canais seguros com backups regulares</Text>

      {/* Status Card */}
      <BackupStatusCard
        lastBackupTime={stats.lastBackupTime}
        channelCount={stats.backedUpChannels}
        hasUnsavedChanges={stats.hasUnsavedChanges}
      />

      {/* Success Message */}
      {successMessage && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>✓ {successMessage}</Text>
        </View>
      )}

      {/* Error Message */}
      {backupError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{backupError}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Ações</Text>

        <ActionButton
          icon="💾"
          label="Criar Backup"
          sublabel={`${stats.totalChannels} canais disponíveis`}
          onPress={handleCreateBackup}
          disabled={isLoading || stats.totalChannels === 0}
          variant="primary"
        />

        <ActionButton
          icon="📤"
          label="Exportar Backup"
          sublabel="Salvar em arquivo encriptado"
          onPress={openExportModal}
          disabled={isLoading || stats.backedUpChannels === 0}
        />

        <ActionButton
          icon="📥"
          label="Importar Backup"
          sublabel="Restaurar de arquivo"
          onPress={openImportModal}
          disabled={isLoading}
        />
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>ℹ️ Sobre Backups</Text>
        <Text style={styles.infoText}>
          Backups de canais Lightning são essenciais para recuperar seus fundos em caso de perda do
          dispositivo. Recomendamos:
        </Text>
        <View style={styles.infoList}>
          <Text style={styles.infoListItem}>• Criar backup após abrir novos canais</Text>
          <Text style={styles.infoListItem}>• Guardar a senha em local seguro</Text>
          <Text style={styles.infoListItem}>• Manter cópias em múltiplos lugares</Text>
        </View>
      </View>

      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#F7931A" />
          <Text style={styles.loadingText}>Processando...</Text>
        </View>
      )}

      {/* Modals */}
      <PasswordModal
        visible={activeModal === 'export'}
        title="Exportar Backup"
        onConfirm={handleExport}
        onCancel={closeModal}
        isLoading={isLoading}
        confirmLabel="Exportar"
        showConfirmPassword
      />

      <ImportModal
        visible={activeModal === 'import'}
        onImport={handleImport}
        onCancel={closeModal}
        isLoading={isLoading}
      />
    </ScrollView>
  )
}

export default memo(BackupSettings)

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  statusCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  warningBanner: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  warningText: {
    fontSize: 12,
    color: '#856404',
  },
  successBanner: {
    backgroundColor: '#d4edda',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  successText: {
    fontSize: 14,
    color: '#155724',
  },
  errorBanner: {
    backgroundColor: '#f8d7da',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#721c24',
  },
  actionsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  actionButtonPrimary: {
    backgroundColor: '#FFF8F0',
    borderColor: '#F7931A',
  },
  actionButtonDanger: {
    backgroundColor: '#fff5f5',
    borderColor: '#e74c3c',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  actionButtonTextContainer: {
    flex: 1,
  },
  actionButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  actionButtonLabelPrimary: {
    color: '#F7931A',
  },
  actionButtonLabelDanger: {
    color: '#e74c3c',
  },
  actionButtonSublabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  infoSection: {
    backgroundColor: '#e8f4fd',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0c5460',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#0c5460',
    marginBottom: 12,
  },
  infoList: {
    marginLeft: 8,
  },
  infoListItem: {
    fontSize: 14,
    color: '#0c5460',
    marginBottom: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalError: {
    color: '#e74c3c',
    fontSize: 14,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonConfirm: {
    backgroundColor: '#F7931A',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
})
