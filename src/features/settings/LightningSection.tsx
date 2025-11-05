import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  TextInput,
  ScrollView,
} from 'react-native'
import colors from '@/ui/colors'
import { useLightning } from '@/features/storage/lightning/lightning'
import { useColorScheme } from 'react-native'
import { alpha } from '@/ui/utils'

interface LightningSectionProps {
  isDark: boolean
}

export default function LightningSection({ isDark }: LightningSectionProps) {
  const colorScheme = useColorScheme()
  const effectiveIsDark = isDark || colorScheme === 'dark'

  const { lightningState, lightningSelectors, lightningActions } = useLightning()
  const { isLoading, isInitialized, isRunning } = {
    isLoading: lightningSelectors.isLightningLoading(lightningState),
    isInitialized: lightningSelectors.isLightningInitialized(lightningState),
    isRunning: lightningSelectors.isLightningRunning(lightningState),
  }

  const handleConnectNetwork = async () => {
    Alert.alert('Conectar à Rede', 'Funcionalidade de conexão à rede será implementada em breve.')
  }

  const handleDisconnectNetwork = () => {
    Alert.alert('Desconectar da Rede', 'Funcionalidade de desconexão será implementada em breve.')
  }

  const handleRetryConnection = async () => {
    Alert.alert('Reconectar', 'Funcionalidade de reconexão será implementada em breve.')
  }

  const handleToggleRouting = (enabled: boolean) => {
    lightningActions.setRoutingEnabled(enabled)
  }

  const handleToggleTrampoline = (enabled: boolean) => {
    lightningActions.setTrampolineEnabled(enabled)
  }

  const handleUpdateMaxFee = (fee: string) => {
    const numFee = parseInt(fee, 10)
    if (!isNaN(numFee) && numFee >= 0) {
      lightningActions.setMaxRoutingFee(numFee)
    }
  }

  const handleUpdateMaxHops = (hops: string) => {
    const numHops = parseInt(hops, 10)
    if (!isNaN(numHops) && numHops >= 1 && numHops <= 50) {
      lightningActions.setMaxRoutingHops(numHops)
    }
  }

  if (!isInitialized) {
    return (
      <View style={styles.section}>
        <Text style={[styles.subtitle, effectiveIsDark && styles.subtitleDark]}>
          Rede Lightning
        </Text>
        <Text style={[styles.description, effectiveIsDark && styles.descriptionDark]}>
          Carteira Lightning não inicializada
        </Text>
      </View>
    )
  }

  if (!isRunning) {
    return (
      <View style={styles.section}>
        <Text style={[styles.subtitle, effectiveIsDark && styles.subtitleDark]}>
          Rede Lightning
        </Text>
        <Text style={[styles.description, effectiveIsDark && styles.descriptionDark]}>
          Carteira Lightning não está rodando
        </Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Lightning Network Dashboard */}
      <LightningDashboard
        lightningState={lightningState}
        effectiveIsDark={effectiveIsDark}
        isLoading={isLoading}
      />

      {/* Lightning Network Controls */}
      <LightningControls
        lightningState={lightningState}
        effectiveIsDark={effectiveIsDark}
        onConnect={handleConnectNetwork}
        onDisconnect={handleDisconnectNetwork}
        onRetry={handleRetryConnection}
        onToggleRouting={handleToggleRouting}
        onToggleTrampoline={handleToggleTrampoline}
        onUpdateMaxFee={handleUpdateMaxFee}
        onUpdateMaxHops={handleUpdateMaxHops}
      />
    </ScrollView>
  )
}

// Lightning Network Dashboard Component
interface LightningDashboardProps {
  lightningState: any
  effectiveIsDark: boolean
  isLoading: boolean
}

function LightningDashboard({
  lightningState,
  effectiveIsDark,
  isLoading,
}: LightningDashboardProps) {
  return (
    <View style={[styles.dashboardSection, effectiveIsDark && styles.dashboardSectionDark]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, effectiveIsDark && styles.sectionTitleDark]}>
          📊 Dashboard da Rede Lightning
        </Text>
        {isLoading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {/* Connection Status Card */}
      <View style={[styles.card, effectiveIsDark && styles.cardDark]}>
        <Text style={[styles.cardTitle, effectiveIsDark && styles.cardTitleDark]}>
          Status da Conexão
        </Text>
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: lightningState.isConnected ? colors.success : colors.error },
              ]}
            />
            <Text style={[styles.statusText, effectiveIsDark && styles.statusTextDark]}>
              {lightningState.isConnected ? 'Conectado' : 'Desconectado'}
            </Text>
          </View>
          <Text style={[styles.statusTime, effectiveIsDark && styles.statusTimeDark]}>
            Última verificação: {new Date().toLocaleTimeString()}
          </Text>
        </View>
      </View>

      {/* Network Statistics Grid */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, effectiveIsDark && styles.statCardDark]}>
          <Text style={[styles.statValue, effectiveIsDark && styles.statValueDark]}>
            {lightningState.nodes.length}
          </Text>
          <Text style={[styles.statLabel, effectiveIsDark && styles.statLabelDark]}>
            Nós Conhecidos
          </Text>
        </View>

        <View style={[styles.statCard, effectiveIsDark && styles.statCardDark]}>
          <Text style={[styles.statValue, effectiveIsDark && styles.statValueDark]}>
            {lightningState.channels.length}
          </Text>
          <Text style={[styles.statLabel, effectiveIsDark && styles.statLabelDark]}>
            Canais Conhecidos
          </Text>
        </View>

        <View style={[styles.statCard, effectiveIsDark && styles.statCardDark]}>
          <Text style={[styles.statValue, effectiveIsDark && styles.statValueDark]}>
            {lightningState.peers?.length || 0}
          </Text>
          <Text style={[styles.statLabel, effectiveIsDark && styles.statLabelDark]}>
            Peers Conectados
          </Text>
        </View>

        <View style={[styles.statCard, effectiveIsDark && styles.statCardDark]}>
          <Text style={[styles.statValue, effectiveIsDark && styles.statValueDark]}>
            {lightningState.payments?.length || 0}
          </Text>
          <Text style={[styles.statLabel, effectiveIsDark && styles.statLabelDark]}>
            Pagamentos
          </Text>
        </View>
      </View>

      {/* Network Information */}
      <View style={[styles.card, effectiveIsDark && styles.cardDark]}>
        <Text style={[styles.cardTitle, effectiveIsDark && styles.cardTitleDark]}>
          Informações da Rede
        </Text>

        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, effectiveIsDark && styles.infoLabelDark]}>
              Última sincronização do gossip:
            </Text>
            <Text style={[styles.infoValue, effectiveIsDark && styles.infoValueDark]}>
              {lightningState.lastGossipUpdate > 0
                ? new Date(lightningState.lastGossipUpdate).toLocaleString()
                : 'Nunca sincronizado'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, effectiveIsDark && styles.infoLabelDark]}>
              Capacidade total da rede:
            </Text>
            <Text style={[styles.infoValue, effectiveIsDark && styles.infoValueDark]}>
              {lightningState.channels.reduce(
                (total: number, channel: any) => total + (channel.capacity || 0),
                0,
              )}{' '}
              sats
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, effectiveIsDark && styles.infoLabelDark]}>
              Taxa média de canais:
            </Text>
            <Text style={[styles.infoValue, effectiveIsDark && styles.infoValueDark]}>
              {lightningState.channels.length > 0
                ? Math.round(
                    lightningState.channels.reduce(
                      (total: number, channel: any) => total + (channel.capacity || 0),
                      0,
                    ) / lightningState.channels.length,
                  )
                : 0}{' '}
              sats
            </Text>
          </View>
        </View>
      </View>

      {/* Recent Activity */}
      <View style={[styles.card, effectiveIsDark && styles.cardDark]}>
        <Text style={[styles.cardTitle, effectiveIsDark && styles.cardTitleDark]}>
          Atividade Recente
        </Text>

        {lightningState.connectionErrors.length > 0 && (
          <View style={styles.activitySection}>
            <Text style={[styles.activityTitle, effectiveIsDark && styles.activityTitleDark]}>
              ⚠️ Últimos Erros ({lightningState.connectionErrors.length})
            </Text>
            {lightningState.connectionErrors.slice(-3).map((error: string, index: number) => (
              <Text key={index} style={[styles.errorText, effectiveIsDark && styles.errorTextDark]}>
                • {error}
              </Text>
            ))}
          </View>
        )}

        {(!lightningState.payments || lightningState.payments.length === 0) &&
          lightningState.connectionErrors.length === 0 && (
            <Text style={[styles.emptyText, effectiveIsDark && styles.emptyTextDark]}>
              Nenhuma atividade recente
            </Text>
          )}
      </View>
    </View>
  )
}

// Lightning Network Controls Component
interface LightningControlsProps {
  lightningState: any
  effectiveIsDark: boolean
  onConnect: () => void
  onDisconnect: () => void
  onRetry: () => void
  onToggleRouting: (enabled: boolean) => void
  onToggleTrampoline: (enabled: boolean) => void
  onUpdateMaxFee: (fee: string) => void
  onUpdateMaxHops: (hops: string) => void
}

function LightningControls({
  lightningState,
  effectiveIsDark,
  onConnect,
  onDisconnect,
  onRetry,
  onToggleRouting,
  onToggleTrampoline,
  onUpdateMaxFee,
  onUpdateMaxHops,
}: LightningControlsProps) {
  return (
    <View style={[styles.controlsSection, effectiveIsDark && styles.controlsSectionDark]}>
      <Text style={[styles.sectionTitle, effectiveIsDark && styles.sectionTitleDark]}>
        ⚙️ Configurações da Rede Lightning
      </Text>

      {/* Connection Controls */}
      <View style={[styles.card, effectiveIsDark && styles.cardDark]}>
        <Text style={[styles.cardTitle, effectiveIsDark && styles.cardTitleDark]}>
          Controles de Conexão
        </Text>

        <View style={styles.buttonGrid}>
          {!lightningState.isConnected ? (
            <TouchableOpacity
              style={[styles.primaryButton, effectiveIsDark && styles.primaryButtonDark]}
              onPress={onConnect}
            >
              <Text style={styles.primaryButtonText}>🔗 Conectar à Rede</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.dangerButton, effectiveIsDark && styles.dangerButtonDark]}
              onPress={onDisconnect}
            >
              <Text style={styles.dangerButtonText}>🔌 Desconectar</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.secondaryButton, effectiveIsDark && styles.secondaryButtonDark]}
            onPress={onRetry}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                effectiveIsDark && styles.secondaryButtonTextDark,
              ]}
            >
              🔄 Reconectar
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Routing Configuration */}
      <View style={[styles.card, effectiveIsDark && styles.cardDark]}>
        <Text style={[styles.cardTitle, effectiveIsDark && styles.cardTitleDark]}>
          Configurações de Roteamento
        </Text>

        <View style={styles.configGrid}>
          <View style={styles.configItem}>
            <Text style={[styles.configLabel, effectiveIsDark && styles.configLabelDark]}>
              Routing Habilitado
            </Text>
            <Switch
              value={lightningState.isRoutingEnabled}
              onValueChange={onToggleRouting}
              trackColor={{ false: colors.disabled, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.configItem}>
            <Text style={[styles.configLabel, effectiveIsDark && styles.configLabelDark]}>
              Trampoline Routing
            </Text>
            <Switch
              value={lightningState.trampolineEnabled}
              onValueChange={onToggleTrampoline}
              trackColor={{ false: colors.disabled, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.configItem}>
            <Text style={[styles.configLabel, effectiveIsDark && styles.configLabelDark]}>
              Taxa Máxima (sats)
            </Text>
            <TextInput
              style={[styles.configInput, effectiveIsDark && styles.configInputDark]}
              value={lightningState.maxRoutingFee.toString()}
              onChangeText={onUpdateMaxFee}
              keyboardType="numeric"
              placeholder="1000"
              placeholderTextColor={
                effectiveIsDark ? colors.textSecondary.dark : colors.textSecondary.light
              }
            />
          </View>

          <View style={styles.configItem}>
            <Text style={[styles.configLabel, effectiveIsDark && styles.configLabelDark]}>
              Máximo de Hops
            </Text>
            <TextInput
              style={[styles.configInput, effectiveIsDark && styles.configInputDark]}
              value={lightningState.maxRoutingHops.toString()}
              onChangeText={onUpdateMaxHops}
              keyboardType="numeric"
              placeholder="20"
              placeholderTextColor={
                effectiveIsDark ? colors.textSecondary.dark : colors.textSecondary.light
              }
            />
          </View>
        </View>
      </View>

      {/* Advanced Settings */}
      <View style={[styles.card, effectiveIsDark && styles.cardDark]}>
        <Text style={[styles.cardTitle, effectiveIsDark && styles.cardTitleDark]}>
          Configurações Avançadas
        </Text>

        <View style={styles.advancedGrid}>
          <View style={styles.advancedItem}>
            <Text style={[styles.advancedLabel, effectiveIsDark && styles.advancedLabelDark]}>
              Timeout de Conexão (segundos)
            </Text>
            <TextInput
              style={[styles.configInput, effectiveIsDark && styles.configInputDark]}
              value="30"
              keyboardType="numeric"
              placeholder="30"
              placeholderTextColor={
                effectiveIsDark ? colors.textSecondary.dark : colors.textSecondary.light
              }
            />
          </View>

          <View style={styles.advancedItem}>
            <Text style={[styles.advancedLabel, effectiveIsDark && styles.advancedLabelDark]}>
              Máximo de Tentativas
            </Text>
            <TextInput
              style={[styles.configInput, effectiveIsDark && styles.configInputDark]}
              value="3"
              keyboardType="numeric"
              placeholder="3"
              placeholderTextColor={
                effectiveIsDark ? colors.textSecondary.dark : colors.textSecondary.light
              }
            />
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    // padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
  },
  subtitleDark: {
    color: colors.textSecondary.dark,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  descriptionDark: {
    color: colors.textSecondary.dark,
  },
  // Dashboard Styles
  dashboardSection: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: alpha(colors.border.light, 0.3),
  },
  dashboardSectionDark: {
    backgroundColor: colors.background.dark,
    borderColor: alpha(colors.border.dark, 0.3),
  },
  // Controls Styles
  controlsSection: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: alpha(colors.border.light, 0.3),
  },
  controlsSectionDark: {
    backgroundColor: colors.background.dark,
    borderColor: alpha(colors.border.dark, 0.3),
  },
  // Card Styles
  card: {
    backgroundColor: colors.background.light,
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: alpha(colors.border.light, 0.5),
  },
  cardDark: {
    backgroundColor: colors.background.dark,
    borderColor: alpha(colors.border.dark, 0.5),
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 12,
  },
  cardTitleDark: {
    color: colors.text.dark,
  },
  // Status Styles
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  statusTextDark: {
    color: colors.text.dark,
  },
  statusTime: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  statusTimeDark: {
    color: colors.textSecondary.dark,
  },
  // Statistics Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  statCard: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 15,
    margin: 5,
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: alpha(colors.border.light, 0.3),
  },
  statCardDark: {
    backgroundColor: colors.background.dark,
    borderColor: alpha(colors.border.dark, 0.3),
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 5,
  },
  statValueDark: {
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  statLabelDark: {
    color: colors.textSecondary.dark,
  },
  // Info Grid
  infoGrid: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
    flex: 1,
  },
  infoLabelDark: {
    color: colors.textSecondary.dark,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.light,
    textAlign: 'right',
    flex: 1,
  },
  infoValueDark: {
    color: colors.text.dark,
  },
  // Activity Styles
  activitySection: {
    marginBottom: 10,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.error,
    marginBottom: 8,
  },
  activityTitleDark: {
    color: colors.error,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginBottom: 4,
  },
  errorTextDark: {
    color: colors.error,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary.light,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyTextDark: {
    color: colors.textSecondary.dark,
  },
  // Button Styles
  buttonGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  primaryButtonDark: {
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  dangerButton: {
    backgroundColor: colors.error,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  dangerButtonDark: {
    backgroundColor: colors.error,
  },
  dangerButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: colors.secondary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  secondaryButtonDark: {
    backgroundColor: colors.secondary,
  },
  secondaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryButtonTextDark: {
    color: colors.white,
  },
  // Config Styles
  configGrid: {
    gap: 15,
  },
  configItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  configLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
    flex: 1,
  },
  configLabelDark: {
    color: colors.textSecondary.dark,
  },
  configInput: {
    backgroundColor: colors.background.light,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text.light,
    width: 80,
    textAlign: 'center',
  },
  configInputDark: {
    backgroundColor: colors.background.dark,
    borderColor: colors.border.dark,
    color: colors.text.dark,
  },
  // Advanced Styles
  advancedGrid: {
    gap: 15,
  },
  advancedItem: {
    gap: 8,
  },
  advancedLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  advancedLabelDark: {
    color: colors.textSecondary.dark,
  },
  // Legacy Styles (keeping for compatibility)
  createButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  createButtonDark: {
    backgroundColor: colors.primary,
  },
  createButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  createButtonTextDark: {
    color: colors.white,
  },
  channelsList: {
    maxHeight: 400,
  },
  channelCard: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  channelCardDark: {
    backgroundColor: colors.background.dark,
    borderColor: colors.border.dark,
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  channelInfo: {
    flex: 1,
  },
  channelId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 5,
  },
  channelIdDark: {
    color: colors.text.dark,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    backgroundColor: colors.error,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  closeButtonDark: {
    backgroundColor: colors.error,
  },
  closeButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  closeButtonTextDark: {
    color: colors.white,
  },
  channelDetails: {
    marginBottom: 10,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  balanceLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  balanceLabelDark: {
    color: colors.textSecondary.dark,
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  balanceValueDark: {
    color: colors.text.dark,
  },
  peerId: {
    fontSize: 12,
    color: colors.textSecondary.light,
    fontFamily: 'monospace',
  },
  peerIdDark: {
    color: colors.textSecondary.dark,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  loadingTextDark: {
    color: colors.textSecondary.dark,
  },
  // Lightning Network Status Styles
  networkSection: {
    backgroundColor: colors.white,
    borderRadius: 32,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: alpha(colors.border.light, 0.5),
  },
  networkSectionDark: {
    backgroundColor: colors.background.dark,
    borderColor: alpha(colors.border.dark, 0.5),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 15,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  statusLabel: {
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  statusLabelDark: {
    color: colors.textSecondary.dark,
  },
  networkStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  networkStatusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  networkStatusText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  networkStatusTextDark: {
    color: colors.text.dark,
  },
  networkInfo: {
    marginBottom: 15,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  connectButton: {
    backgroundColor: colors.success,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    flex: 1,
    marginRight: 10,
  },
  connectButtonDark: {
    backgroundColor: colors.success,
  },
  connectButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  connectButtonTextDark: {
    color: colors.white,
  },
  disconnectButton: {
    backgroundColor: colors.error,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    flex: 1,
    marginRight: 10,
  },
  disconnectButtonDark: {
    backgroundColor: colors.error,
  },
  disconnectButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  disconnectButtonTextDark: {
    color: colors.white,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    flex: 1,
  },
  retryButtonDark: {
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  retryButtonTextDark: {
    color: colors.white,
  },
  errorsContainer: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 6,
    padding: 10,
    marginBottom: 15,
  },
  errorsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.error,
    marginBottom: 5,
  },
  errorsTitleDark: {
    color: colors.error,
  },
  configSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    paddingTop: 15,
  },
  configTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
    marginBottom: 10,
  },
  configTitleDark: {
    color: colors.text.dark,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
})
