/**
 * RecoveryWizard - Wizard de Recuperação de Canais Lightning
 *
 * Guia o usuário através do processo de recuperação de canais:
 * 1. Importar backup encriptado
 * 2. Revisar canais a recuperar
 * 3. Conectar aos peers
 * 4. Iniciar force close e monitorar
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
} from 'react-native'

import { useChannelBackup } from './hooks'
import { RestoreState, RestoreContext, ChannelBackupData } from '@/core/lib/lightning/backup'

// ==========================================
// TYPES
// ==========================================

export enum WizardStep {
  IMPORT = 0,
  REVIEW = 1,
  CONNECT = 2,
  MONITOR = 3,
  COMPLETE = 4,
}

interface RecoveryWizardProps {
  /** Callback quando recuperação é completada */
  onComplete?: () => void
  /** Callback para cancelar wizard */
  onCancel?: () => void
  /** Callback para erro */
  onError?: (error: string) => void
}

interface StepIndicatorProps {
  currentStep: WizardStep
  totalSteps: number
}

interface ChannelCardProps {
  channel: ChannelBackupData
  context?: RestoreContext
  showDetails?: boolean
}

interface PasswordInputProps {
  password: string
  onPasswordChange: (text: string) => void
  placeholder: string
  error?: string | null
}

// ==========================================
// CONSTANTS
// ==========================================

const STEP_TITLES: Record<WizardStep, string> = {
  [WizardStep.IMPORT]: 'Importar Backup',
  [WizardStep.REVIEW]: 'Revisar Canais',
  [WizardStep.CONNECT]: 'Conectar aos Peers',
  [WizardStep.MONITOR]: 'Monitorar Blockchain',
  [WizardStep.COMPLETE]: 'Recuperação Completa',
}

const STEP_DESCRIPTIONS: Record<WizardStep, string> = {
  [WizardStep.IMPORT]: 'Cole ou importe seu backup encriptado de canais Lightning.',
  [WizardStep.REVIEW]: 'Revise os canais que serão recuperados.',
  [WizardStep.CONNECT]: 'Conectando aos peers para solicitar force close.',
  [WizardStep.MONITOR]: 'Monitorando a blockchain para varrer seus fundos.',
  [WizardStep.COMPLETE]: 'Seus canais foram recuperados com sucesso!',
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

const StepIndicator = memo(function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <View style={styles.stepIndicator}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <View key={i} style={styles.stepDot}>
          <View
            style={[
              styles.dot,
              i < currentStep && styles.dotCompleted,
              i === currentStep && styles.dotActive,
              i > currentStep && styles.dotPending,
            ]}
          >
            {i < currentStep ? (
              <Text style={styles.dotText}>✓</Text>
            ) : (
              <Text style={styles.dotText}>{i + 1}</Text>
            )}
          </View>
          {i < totalSteps - 1 && (
            <View style={[styles.stepLine, i < currentStep && styles.lineCompleted]} />
          )}
        </View>
      ))}
    </View>
  )
})

const PasswordInput = memo(function PasswordInput({
  password,
  onPasswordChange,
  placeholder,
  error,
}: PasswordInputProps) {
  return (
    <View style={styles.inputContainer}>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={password}
        onChangeText={onPasswordChange}
        placeholder={placeholder}
        placeholderTextColor="#666"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
})

const ChannelCard = memo(function ChannelCard({
  channel,
  context,
  showDetails = false,
}: ChannelCardProps) {
  const getStateIcon = (state?: RestoreState): string => {
    switch (state) {
      case RestoreState.PENDING:
        return '⏳'
      case RestoreState.CONNECTING:
        return '🔗'
      case RestoreState.REQUESTING_CLOSE:
        return '📤'
      case RestoreState.MONITORING:
        return '👁️'
      case RestoreState.COMPLETED:
        return '✅'
      case RestoreState.FAILED:
        return '❌'
      default:
        return '📝'
    }
  }

  const getStateText = (state?: RestoreState): string => {
    switch (state) {
      case RestoreState.PENDING:
        return 'Pendente'
      case RestoreState.CONNECTING:
        return 'Conectando...'
      case RestoreState.REQUESTING_CLOSE:
        return 'Solicitando close...'
      case RestoreState.MONITORING:
        return 'Monitorando...'
      case RestoreState.COMPLETED:
        return 'Completo'
      case RestoreState.FAILED:
        return 'Falhou'
      default:
        return 'Aguardando'
    }
  }

  const shortenId = (id: string) => `${id.slice(0, 8)}...${id.slice(-8)}`
  const shortenNodeId = (id: string) => `${id.slice(0, 16)}...${id.slice(-8)}`

  return (
    <View style={styles.channelCard}>
      <View style={styles.channelHeader}>
        <Text style={styles.channelIcon}>{getStateIcon(context?.state)}</Text>
        <View style={styles.channelInfo}>
          <Text style={styles.channelId}>{shortenId(channel.channelId)}</Text>
          <Text style={styles.channelPeer}>{shortenNodeId(channel.nodeId)}</Text>
        </View>
        <Text style={styles.channelState}>{getStateText(context?.state)}</Text>
      </View>

      {showDetails && (
        <View style={styles.channelDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Funding TX:</Text>
            <Text style={styles.detailValue}>{shortenId(channel.fundingTxid)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Host:</Text>
            <Text style={styles.detailValue}>
              {channel.host}:{channel.port}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Iniciador:</Text>
            <Text style={styles.detailValue}>{channel.isInitiator ? 'Sim' : 'Não'}</Text>
          </View>
          {context?.error && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Erro:</Text>
              <Text style={[styles.detailValue, styles.errorValue]}>{context.error}</Text>
            </View>
          )}
          {context?.closingTxid && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Closing TX:</Text>
              <Text style={styles.detailValue}>{shortenId(context.closingTxid)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
})

// ==========================================
// STEP COMPONENTS
// ==========================================

interface ImportStepProps {
  backupData: string
  onBackupDataChange: (text: string) => void
  password: string
  onPasswordChange: (text: string) => void
  onImport: () => void
  isLoading: boolean
  error: string | null
}

const ImportStep = memo(function ImportStep({
  backupData,
  onBackupDataChange,
  password,
  onPasswordChange,
  onImport,
  isLoading,
  error,
}: ImportStepProps) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.inputLabel}>Dados do Backup</Text>
      <TextInput
        style={[styles.textArea, error && styles.inputError]}
        value={backupData}
        onChangeText={onBackupDataChange}
        placeholder="Cole aqui os dados do backup encriptado (IHODL_CB:...)"
        placeholderTextColor="#666"
        multiline
        numberOfLines={6}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
      />

      <Text style={styles.inputLabel}>Senha do Backup</Text>
      <PasswordInput
        password={password}
        onPasswordChange={onPasswordChange}
        placeholder="Digite a senha usada na exportação"
        error={error}
      />

      <TouchableOpacity
        style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
        onPress={onImport}
        disabled={isLoading || !backupData.trim() || !password}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Importar Backup</Text>
        )}
      </TouchableOpacity>

      <View style={styles.helpBox}>
        <Text style={styles.helpTitle}>💡 Dica</Text>
        <Text style={styles.helpText}>
          Você pode obter o backup do arquivo exportado anteriormente. O backup começa com
          "IHODL_CB:" e contém seus canais encriptados.
        </Text>
      </View>
    </View>
  )
})

interface ReviewStepProps {
  channels: ChannelBackupData[]
  onStartRestore: () => void
  onBack: () => void
  isLoading: boolean
}

const ReviewStep = memo(function ReviewStep({
  channels,
  onStartRestore,
  onBack,
  isLoading,
}: ReviewStepProps) {
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)

  const toggleChannel = useCallback((channelId: string) => {
    setExpandedChannel(prev => (prev === channelId ? null : channelId))
  }, [])

  return (
    <View style={styles.stepContent}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Canais Encontrados</Text>
        <Text style={styles.summaryValue}>{channels.length}</Text>
      </View>

      <Text style={styles.sectionTitle}>Lista de Canais</Text>
      <ScrollView style={styles.channelList}>
        {channels.map(channel => (
          <TouchableOpacity
            key={channel.channelId}
            onPress={() => toggleChannel(channel.channelId)}
          >
            <ChannelCard channel={channel} showDetails={expandedChannel === channel.channelId} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Atenção</Text>
        <Text style={styles.warningText}>
          A recuperação irá solicitar o force close dos canais. Isso pode levar tempo e incorrer em
          taxas de mineração. Seus fundos serão enviados para sua carteira on-chain após a
          confirmação.
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onBack} disabled={isLoading}>
          <Text style={styles.secondaryButtonText}>Voltar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, styles.buttonFlex, isLoading && styles.buttonDisabled]}
          onPress={onStartRestore}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Iniciar Recuperação</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
})

interface MonitorStepProps {
  contexts: RestoreContext[]
  summary: {
    pendingChannels: number
    completedChannels: number
    failedChannels: number
    totalChannels: number
  } | null
  onRetryFailed: () => void
  onContinue: () => void
  isLoading: boolean
}

const MonitorStep = memo(function MonitorStep({
  contexts,
  summary,
  onRetryFailed,
  onContinue,
  isLoading,
}: MonitorStepProps) {
  const hasFailures = (summary?.failedChannels ?? 0) > 0
  const isComplete = (summary?.pendingChannels ?? 0) === 0
  const allCompleted = summary?.completedChannels === summary?.totalChannels

  return (
    <View style={styles.stepContent}>
      {/* Progress Summary */}
      <View style={styles.progressSummary}>
        <View style={styles.progressItem}>
          <Text style={styles.progressIcon}>⏳</Text>
          <Text style={styles.progressValue}>{summary?.pendingChannels ?? 0}</Text>
          <Text style={styles.progressLabel}>Pendentes</Text>
        </View>
        <View style={styles.progressItem}>
          <Text style={styles.progressIcon}>✅</Text>
          <Text style={styles.progressValue}>{summary?.completedChannels ?? 0}</Text>
          <Text style={styles.progressLabel}>Completos</Text>
        </View>
        <View style={styles.progressItem}>
          <Text style={styles.progressIcon}>❌</Text>
          <Text style={styles.progressValue}>{summary?.failedChannels ?? 0}</Text>
          <Text style={styles.progressLabel}>Falhas</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${((summary?.completedChannels ?? 0) / (summary?.totalChannels ?? 1)) * 100}%`,
              },
            ]}
          />
          <View
            style={[
              styles.progressFillFailed,
              {
                width: `${((summary?.failedChannels ?? 0) / (summary?.totalChannels ?? 1)) * 100}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Channel Status List */}
      <Text style={styles.sectionTitle}>Status dos Canais</Text>
      <ScrollView style={styles.channelList}>
        {contexts.map(context => (
          <ChannelCard
            key={context.backup.channelId}
            channel={context.backup}
            context={context}
            showDetails={context.state === RestoreState.FAILED}
          />
        ))}
      </ScrollView>

      {/* Info Box */}
      {!isComplete && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Aguarde</Text>
          <Text style={styles.infoText}>
            O processo de recuperação pode levar alguns minutos. Os peers precisam fazer force close
            e as transações precisam ser confirmadas.
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.buttonRow}>
        {hasFailures && (
          <TouchableOpacity
            style={[styles.secondaryButton, isLoading && styles.buttonDisabled]}
            onPress={onRetryFailed}
            disabled={isLoading}
          >
            <Text style={styles.secondaryButtonText}>Tentar Novamente</Text>
          </TouchableOpacity>
        )}

        {isComplete && (
          <TouchableOpacity
            style={[styles.primaryButton, styles.buttonFlex, isLoading && styles.buttonDisabled]}
            onPress={onContinue}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>{allCompleted ? 'Concluir' : 'Continuar'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
})

interface CompleteStepProps {
  summary: {
    completedChannels: number
    failedChannels: number
    totalChannels: number
  } | null
  onFinish: () => void
}

const CompleteStep = memo(function CompleteStep({ summary, onFinish }: CompleteStepProps) {
  const allCompleted = summary?.completedChannels === summary?.totalChannels

  return (
    <View style={styles.stepContent}>
      <View style={styles.completeIcon}>
        <Text style={styles.completeEmoji}>{allCompleted ? '🎉' : '⚠️'}</Text>
      </View>

      <Text style={styles.completeTitle}>
        {allCompleted ? 'Recuperação Completa!' : 'Recuperação Parcial'}
      </Text>

      <Text style={styles.completeSubtitle}>
        {allCompleted
          ? 'Todos os seus canais foram recuperados com sucesso.'
          : `${summary?.completedChannels ?? 0} de ${summary?.totalChannels ?? 0} canais foram recuperados.`}
      </Text>

      {/* Results */}
      <View style={styles.resultsCard}>
        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Canais Recuperados</Text>
          <Text style={[styles.resultValue, styles.successText]}>
            {summary?.completedChannels ?? 0}
          </Text>
        </View>
        {(summary?.failedChannels ?? 0) > 0 && (
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Canais com Falha</Text>
            <Text style={[styles.resultValue, styles.errorText]}>
              {summary?.failedChannels ?? 0}
            </Text>
          </View>
        )}
      </View>

      {(summary?.failedChannels ?? 0) > 0 && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Sobre as Falhas</Text>
          <Text style={styles.infoText}>
            Alguns canais podem ter falhado devido a peers offline ou problemas de conexão. Você
            pode tentar novamente mais tarde importando o backup.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={onFinish}>
        <Text style={styles.buttonText}>Concluir</Text>
      </TouchableOpacity>
    </View>
  )
})

// ==========================================
// MAIN COMPONENT
// ==========================================

function RecoveryWizard({ onComplete, onCancel, onError }: RecoveryWizardProps) {
  const { backupState, isLoading, error, importBackup, startRestore, clearBackup } =
    useChannelBackup()

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(WizardStep.IMPORT)
  const [backupData, setBackupData] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  // Computed values
  const channels = useMemo(
    () => backupState.currentBackup?.channels ?? [],
    [backupState.currentBackup],
  )

  const restoreContexts = useMemo(() => backupState.restoreContexts, [backupState.restoreContexts])

  const restoreSummary = useMemo(() => backupState.restoreSummary, [backupState.restoreSummary])

  // Função para mudar step que também limpa o erro (evita useEffect + setState)
  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step)
    setLocalError(null)
  }, [])

  // Handle import
  const handleImport = useCallback(async () => {
    setLocalError(null)

    const result = await importBackup(backupData.trim(), password)

    if (!result.success) {
      setLocalError(result.error ?? 'Erro ao importar backup')
      onError?.(result.error ?? 'Erro ao importar backup')
      return
    }

    // Move to review step
    goToStep(WizardStep.REVIEW)
  }, [backupData, password, importBackup, onError, goToStep])

  // Handle start restore
  const handleStartRestore = useCallback(async () => {
    setLocalError(null)

    const result = await startRestore()

    if (!result.success) {
      setLocalError(result.error ?? 'Erro ao iniciar recuperação')
      onError?.(result.error ?? 'Erro ao iniciar recuperação')
      return
    }

    // Move to connect step
    goToStep(WizardStep.CONNECT)

    // Simulate connection process (in real implementation, this would be handled by the service)
    setTimeout(() => {
      goToStep(WizardStep.MONITOR)
    }, 2000)
  }, [startRestore, onError, goToStep])

  // Handle retry failed
  const handleRetryFailed = useCallback(async () => {
    // In real implementation, retry only failed channels
    setLocalError(null)
    await startRestore()
  }, [startRestore])

  // Handle continue from monitor
  const handleContinue = useCallback(() => {
    goToStep(WizardStep.COMPLETE)
  }, [goToStep])

  // Handle finish
  const handleFinish = useCallback(() => {
    clearBackup()
    onComplete?.()
  }, [clearBackup, onComplete])

  // Handle back
  const handleBack = useCallback(() => {
    if (currentStep > WizardStep.IMPORT) {
      goToStep((currentStep - 1) as WizardStep)
    }
  }, [currentStep, goToStep])

  // Handle cancel
  const handleCancel = useCallback(() => {
    Alert.alert(
      'Cancelar Recuperação',
      'Tem certeza que deseja cancelar? O progresso será perdido.',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, cancelar',
          style: 'destructive',
          onPress: () => {
            clearBackup()
            onCancel?.()
          },
        },
      ],
    )
  }, [clearBackup, onCancel])

  // Combined error
  const displayError = localError ?? error

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recuperação de Canais</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Step Indicator */}
      <StepIndicator currentStep={currentStep} totalSteps={5} />

      {/* Step Title & Description */}
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{STEP_TITLES[currentStep]}</Text>
        <Text style={styles.stepDescription}>{STEP_DESCRIPTIONS[currentStep]}</Text>
      </View>

      {/* Step Content */}
      {currentStep === WizardStep.IMPORT && (
        <ImportStep
          backupData={backupData}
          onBackupDataChange={setBackupData}
          password={password}
          onPasswordChange={setPassword}
          onImport={handleImport}
          isLoading={isLoading}
          error={displayError}
        />
      )}

      {currentStep === WizardStep.REVIEW && (
        <ReviewStep
          channels={channels}
          onStartRestore={handleStartRestore}
          onBack={handleBack}
          isLoading={isLoading}
        />
      )}

      {(currentStep === WizardStep.CONNECT || currentStep === WizardStep.MONITOR) && (
        <MonitorStep
          contexts={restoreContexts}
          summary={restoreSummary}
          onRetryFailed={handleRetryFailed}
          onContinue={handleContinue}
          isLoading={isLoading || currentStep === WizardStep.CONNECT}
        />
      )}

      {currentStep === WizardStep.COMPLETE && (
        <CompleteStep summary={restoreSummary} onFinish={handleFinish} />
      )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  cancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: '#888',
    fontSize: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },

  // Step Indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  stepDot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotCompleted: {
    backgroundColor: '#f7931a',
  },
  dotActive: {
    backgroundColor: '#f7931a',
    borderWidth: 2,
    borderColor: '#ffc266',
  },
  dotPending: {
    backgroundColor: '#333',
  },
  dotText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepLine: {
    width: 24,
    height: 2,
    backgroundColor: '#333',
    marginHorizontal: 4,
  },
  lineCompleted: {
    backgroundColor: '#f7931a',
  },

  // Step Header
  stepHeader: {
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },

  // Step Content
  stepContent: {
    flex: 1,
  },

  // Input styles
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  inputError: {
    borderColor: '#ff4444',
  },
  textArea: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: 4,
  },

  // Buttons
  primaryButton: {
    backgroundColor: '#f7931a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  secondaryButton: {
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  buttonFlex: {
    flex: 1,
  },

  // Help/Info boxes
  helpBox: {
    backgroundColor: '#1a2a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#2a4a2a',
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4a9',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  infoBox: {
    backgroundColor: '#1a1a2a',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
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
  warningBox: {
    backgroundColor: '#2a2a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#4a4a2a',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fa4',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },

  // Summary card
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#f7931a',
  },

  // Section title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },

  // Channel list
  channelList: {
    maxHeight: 300,
    marginBottom: 16,
  },

  // Channel card
  channelCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  channelIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  channelInfo: {
    flex: 1,
  },
  channelId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    fontFamily: 'monospace',
  },
  channelPeer: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  channelState: {
    fontSize: 12,
    color: '#888',
  },
  channelDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailValue: {
    fontSize: 12,
    color: '#fff',
    fontFamily: 'monospace',
  },
  errorValue: {
    color: '#ff4444',
  },

  // Progress summary
  progressSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  progressItem: {
    alignItems: 'center',
  },
  progressIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  progressValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  progressLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },

  // Progress bar
  progressBarContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4a9',
  },
  progressFillFailed: {
    height: '100%',
    backgroundColor: '#f44',
  },

  // Complete step
  completeIcon: {
    alignItems: 'center',
    marginBottom: 24,
  },
  completeEmoji: {
    fontSize: 80,
  },
  completeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  completeSubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },

  // Results card
  resultsCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 14,
    color: '#888',
  },
  resultValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  successText: {
    color: '#4a9',
  },
})

export default memo(RecoveryWizard)
