/**
 * LightningSettingsSection
 *
 * Seção de configurações Lightning Network para a tela de Settings.
 * Contém apenas configurações e ajustes - sem ações de navegação.
 *
 * Seções:
 * 1. Status (read-only)
 * 2. Rede
 * 3. Roteamento & Pagamentos
 * 4. Privacidade
 * 5. Backup
 * 6. Watchtower
 * 7. Submarine Swaps
 * 8. Canais
 * 9. Avançado
 */

import React, { useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Switch,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
} from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useSettings } from '@/ui/features/app-provider'
import { useLightningState, useConnectionState } from '../lightning/hooks'
import type {
  LightningNetwork,
  RoutingStrategy,
  WatchtowerConfig,
  BackupConfig,
  PrivacyConfig,
  SwapLimitsConfig,
  AdvancedConfig,
} from './state'

// ==========================================
// TYPES
// ==========================================

interface LightningSettingsSectionProps {
  isDark: boolean
}

interface SectionProps {
  title: string
  icon: string
  isDark: boolean
  children: React.ReactNode
  collapsible?: boolean
  defaultExpanded?: boolean
}

interface SettingRowProps {
  label: string
  description?: string
  isDark: boolean
  children: React.ReactNode
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

const Section: React.FC<SectionProps> = ({
  title,
  icon,
  isDark,
  children,
  collapsible = true,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <View style={[styles.section, isDark && styles.sectionDark]}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => collapsible && setExpanded(!expanded)}
        disabled={!collapsible}
      >
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionIcon}>{icon}</Text>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{title}</Text>
        </View>
        {collapsible && (
          <IconSymbol
            name={expanded ? 'chevron.up' : 'chevron.down'}
            size={20}
            color={isDark ? colors.textSecondary.dark : colors.textSecondary.light}
          />
        )}
      </TouchableOpacity>
      {expanded && <View style={styles.sectionContent}>{children}</View>}
    </View>
  )
}

const SettingRow: React.FC<SettingRowProps> = ({ label, description, isDark, children }) => (
  <View style={styles.settingRow}>
    <View style={styles.settingInfo}>
      <Text style={[styles.settingLabel, isDark && styles.settingLabelDark]}>{label}</Text>
      {description && (
        <Text style={[styles.settingDescription, isDark && styles.settingDescriptionDark]}>
          {description}
        </Text>
      )}
    </View>
    <View style={styles.settingControl}>{children}</View>
  </View>
)

const StatusBadge: React.FC<{ status: 'connected' | 'disconnected' }> = ({ status }) => {
  const statusColors = {
    connected: colors.success,
    disconnected: colors.error,
  }
  const statusLabels = {
    connected: 'Conectado',
    disconnected: 'Desconectado',
  }

  return (
    <View style={[styles.statusBadge, { backgroundColor: alpha(statusColors[status], 0.15) }]}>
      <View style={[styles.statusDot, { backgroundColor: statusColors[status] }]} />
      <Text style={[styles.statusText, { color: statusColors[status] }]}>
        {statusLabels[status]}
      </Text>
    </View>
  )
}

interface NetworkSelectorProps {
  value: LightningNetwork
  onChange: (network: LightningNetwork) => void
  isDark: boolean
}

const NetworkSelector: React.FC<NetworkSelectorProps> = ({ value, onChange, isDark }) => {
  const [modalVisible, setModalVisible] = useState(false)

  const networks: { value: LightningNetwork; label: string }[] = [
    { value: 'mainnet', label: 'Mainnet' },
    { value: 'testnet', label: 'Testnet' },
    { value: 'regtest', label: 'Regtest' },
  ]

  const currentLabel = networks.find(n => n.value === value)?.label || 'Mainnet'

  return (
    <>
      <TouchableOpacity
        style={[styles.networkButton, isDark && styles.networkButtonDark]}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.networkButtonText}>{currentLabel}</Text>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={[styles.modalContent, isDark && styles.modalContentDark]}>
            <Text style={[styles.modalTitle, isDark && styles.modalTitleDark]}>
              Selecionar Rede
            </Text>
            {networks.map(network => (
              <TouchableOpacity
                key={network.value}
                style={[
                  styles.networkOption,
                  value === network.value && styles.networkOptionSelected,
                  isDark && styles.networkOptionDark,
                ]}
                onPress={() => {
                  onChange(network.value)
                  setModalVisible(false)
                }}
              >
                <Text
                  style={[
                    styles.networkOptionText,
                    value === network.value && styles.networkOptionTextSelected,
                    isDark && styles.networkOptionTextDark,
                  ]}
                >
                  {network.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function LightningSettingsSection({ isDark }: LightningSettingsSectionProps) {
  const { lightning, dispatch, actions } = useSettings()
  const connectionState = useConnectionState()
  const lightningState = useLightningState()

  // Handlers
  const handleNetworkChange = (network: LightningNetwork) => {
    dispatch(actions.setLightningNetwork(network))
  }

  const handlePrivacyChange = (key: keyof PrivacyConfig, value: boolean) => {
    dispatch(actions.setPrivacyConfig({ [key]: value }))
  }

  const handleWatchtowerChange = (
    key: keyof WatchtowerConfig,
    value: boolean | string | number,
  ) => {
    dispatch(actions.setWatchtowerConfig({ [key]: value }))
  }

  const handleBackupChange = (key: keyof BackupConfig, value: boolean | string) => {
    dispatch(actions.setBackupConfig({ [key]: value }))
  }

  const handleSwapLimitsChange = (key: keyof SwapLimitsConfig, value: number | boolean) => {
    dispatch(actions.setSwapLimits({ [key]: value }))
  }

  const handleAdvancedChange = (
    key: keyof AdvancedConfig,
    value: number | boolean | RoutingStrategy,
  ) => {
    dispatch(actions.setAdvancedConfig({ [key]: value }))
  }

  const handleRoutingStrategyChange = (strategy: RoutingStrategy) => {
    dispatch(actions.setRoutingStrategy(strategy))
  }

  const handleTrampolineNodeToggle = (nodeId: string, enabled: boolean) => {
    const node = lightning.trampolineNodes?.find(n => n.nodeId === nodeId)
    if (node) {
      dispatch(actions.updateTrampolineNode({ ...node, enabled }))
    }
  }

  const formatSats = (sats: number) => {
    if (sats >= 100000000) {
      return `${(sats / 100000000).toFixed(2)} BTC`
    } else if (sats >= 1000000) {
      return `${(sats / 1000000).toFixed(2)}M sats`
    } else if (sats >= 1000) {
      return `${(sats / 1000).toFixed(1)}k sats`
    }
    return `${sats} sats`
  }

  const getConnectionStatus = (): 'connected' | 'disconnected' => {
    return connectionState.isConnected ? 'connected' : 'disconnected'
  }

  return (
    <View style={styles.container}>
      {/* ========== STATUS (Read-Only) ========== */}
      <Section title="Status" icon="⚡" isDark={isDark} collapsible={false}>
        <View style={styles.statusContainer}>
          <StatusBadge status={getConnectionStatus()} />
          <Text style={[styles.networkLabel, isDark && styles.networkLabelDark]}>
            Rede: {lightning.network?.toUpperCase() ?? 'MAINNET'}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statBox, isDark && styles.statBoxDark]}>
            <Text style={styles.statValue}>{lightningState.channels?.length ?? 0}</Text>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Canais</Text>
          </View>
          <View style={[styles.statBox, isDark && styles.statBoxDark]}>
            <Text style={styles.statValue}>
              {formatSats(Number(lightningState.totalBalance ?? 0))}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Saldo</Text>
          </View>
          <View style={[styles.statBox, isDark && styles.statBoxDark]}>
            <Text style={styles.statValue}>
              {lightningState.channels?.filter(c => c.isActive).length ?? 0}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Ativos</Text>
          </View>
        </View>
      </Section>

      {/* ========== REDE ========== */}
      <Section title="Rede" icon="🌐" isDark={isDark}>
        <SettingRow
          label="Rede Bitcoin"
          description="Rede utilizada para transações"
          isDark={isDark}
        >
          <NetworkSelector
            value={lightning.network}
            onChange={handleNetworkChange}
            isDark={isDark}
          />
        </SettingRow>
      </Section>

      {/* ========== ROTEAMENTO ========== */}
      <Section title="Roteamento & Pagamentos" icon="🔀" isDark={isDark}>
        <SettingRow
          label="Trampoline Routing"
          description="Delega cálculo de rota para nós intermediários"
          isDark={isDark}
        >
          <Switch
            value={lightning.trampolineRoutingEnabled ?? false}
            onValueChange={v => dispatch(actions.setTrampolineRouting(v))}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow
          label="Multi-Part Payments (MPP)"
          description="Dividir pagamentos em múltiplas partes"
          isDark={isDark}
        >
          <Switch
            value={lightning.mppEnabled ?? false}
            onValueChange={v => dispatch(actions.setMppEnabled(v))}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <View style={[styles.divider, isDark && styles.dividerDark]} />

        <Text style={[styles.subsectionTitle, isDark && styles.subsectionTitleDark]}>
          Estratégia de Roteamento
        </Text>

        {(['lowest_fee', 'fastest', 'most_reliable', 'balanced'] as RoutingStrategy[])?.map(
          strategy => (
            <TouchableOpacity
              key={strategy}
              style={[
                styles.optionRow,
                lightning.advanced?.routingStrategy === strategy && styles.optionRowSelected,
                isDark && styles.optionRowDark,
              ]}
              onPress={() => handleRoutingStrategyChange(strategy)}
            >
              <Text style={[styles.optionLabel, isDark && styles.optionLabelDark]}>
                {strategy === 'lowest_fee' && '💰 Menor Taxa'}
                {strategy === 'fastest' && '⚡ Mais Rápido'}
                {strategy === 'most_reliable' && '✅ Mais Confiável'}
                {strategy === 'balanced' && '⚖️ Balanceado'}
              </Text>
              {lightning.advanced?.routingStrategy === strategy && (
                <IconSymbol name="checkmark" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ),
        )}

        {lightning.trampolineRoutingEnabled && (
          <>
            <View style={[styles.divider, isDark && styles.dividerDark]} />
            <Text style={[styles.subsectionTitle, isDark && styles.subsectionTitleDark]}>
              Nós Trampoline Preferidos
            </Text>
            {lightning.trampolineNodes?.map(node => (
              <SettingRow
                key={node.nodeId}
                label={node.alias}
                description={`Prioridade: ${node.priority}`}
                isDark={isDark}
              >
                <Switch
                  value={node.enabled}
                  onValueChange={v => handleTrampolineNodeToggle(node.nodeId, v)}
                  trackColor={{ false: colors.disabled, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </SettingRow>
            ))}
          </>
        )}
      </Section>

      {/* ========== PRIVACIDADE ========== */}
      <Section title="Privacidade" icon="🔒" isDark={isDark}>
        <SettingRow
          label="Blinded Paths"
          description="Ocultar identidade do destinatário nos pagamentos"
          isDark={isDark}
        >
          <Switch
            value={lightning.privacy?.blindedPathsEnabled ?? false}
            onValueChange={v => handlePrivacyChange('blindedPathsEnabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow
          label="Onion Messages"
          description="Mensagens privadas via rede Lightning"
          isDark={isDark}
        >
          <Switch
            value={lightning.privacy?.onionMessagesEnabled ?? false}
            onValueChange={v => handlePrivacyChange('onionMessagesEnabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow
          label="Apenas Canais Privados"
          description="Não anunciar canais na rede gossip"
          isDark={isDark}
        >
          <Switch
            value={lightning.privacy?.usePrivateChannelsOnly ?? false}
            onValueChange={v => handlePrivacyChange('usePrivateChannelsOnly', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow label="Nó Oculto" description="Não revelar IP/identidade do nó" isDark={isDark}>
          <Switch
            value={lightning.privacy?.hiddenNode ?? false}
            onValueChange={v => handlePrivacyChange('hiddenNode', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>
      </Section>

      {/* ========== BACKUP ========== */}
      <Section title="Backup & Recuperação" icon="💾" isDark={isDark}>
        <SettingRow
          label="Backup Automático"
          description="Fazer backup automaticamente quando estado mudar"
          isDark={isDark}
        >
          <Switch
            value={lightning.backup?.autoBackupEnabled ?? false}
            onValueChange={v => handleBackupChange('autoBackupEnabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow
          label="Criptografar com Senha"
          description="Exigir senha para restaurar backup"
          isDark={isDark}
        >
          <Switch
            value={lightning.backup?.encryptWithPassword ?? false}
            onValueChange={v => handleBackupChange('encryptWithPassword', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <View style={[styles.divider, isDark && styles.dividerDark]} />

        <Text style={[styles.subsectionTitle, isDark && styles.subsectionTitleDark]}>
          Provedor de Nuvem
        </Text>

        {(['none', 'icloud', 'gdrive'] as const)?.map(provider => (
          <TouchableOpacity
            key={provider}
            style={[
              styles.optionRow,
              lightning.backup?.cloudProvider === provider && styles.optionRowSelected,
              isDark && styles.optionRowDark,
            ]}
            onPress={() => handleBackupChange('cloudProvider', provider)}
          >
            <Text style={[styles.optionLabel, isDark && styles.optionLabelDark]}>
              {provider === 'none' && '📵 Nenhum (Local)'}
              {provider === 'icloud' && '☁️ iCloud'}
              {provider === 'gdrive' && '📁 Google Drive'}
            </Text>
            {lightning.backup?.cloudProvider === provider && (
              <IconSymbol name="checkmark" size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </Section>

      {/* ========== WATCHTOWER ========== */}
      <Section title="Watchtower" icon="👁️" isDark={isDark}>
        <SettingRow
          label="Watchtower Local"
          description="Monitorar canais neste dispositivo"
          isDark={isDark}
        >
          <Switch
            value={lightning.watchtower?.localEnabled ?? false}
            onValueChange={v => handleWatchtowerChange('localEnabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow
          label="Watchtower Remoto"
          description="Usar servidor externo para monitoramento"
          isDark={isDark}
        >
          <Switch
            value={lightning.watchtower?.remoteEnabled ?? false}
            onValueChange={v => handleWatchtowerChange('remoteEnabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        {lightning.watchtower?.remoteEnabled && (
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>
              URL do Servidor
            </Text>
            <TextInput
              style={[styles.textInput, isDark && styles.textInputDark]}
              value={lightning.watchtower?.remoteUrl ?? ''}
              onChangeText={v => handleWatchtowerChange('remoteUrl', v)}
              placeholder="wss://watchtower.example.com"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        <SettingRow
          label="Upload Automático"
          description="Enviar revogações automaticamente"
          isDark={isDark}
        >
          <Switch
            value={lightning.watchtower?.autoUploadRevocations ?? false}
            onValueChange={v => handleWatchtowerChange('autoUploadRevocations', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>
      </Section>

      {/* ========== SUBMARINE SWAPS ========== */}
      <Section title="Submarine Swaps" icon="🔄" isDark={isDark}>
        <SettingRow
          label="Auto-Swap"
          description="Balancear automaticamente on-chain e Lightning"
          isDark={isDark}
        >
          <Switch
            value={lightning.swapLimits?.autoSwapEnabled ?? false}
            onValueChange={v => handleSwapLimitsChange('autoSwapEnabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        {lightning.swapLimits?.autoSwapEnabled && (
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>
              Balanço Alvo (% Lightning)
            </Text>
            <TextInput
              style={[styles.textInput, isDark && styles.textInputDark]}
              value={lightning.swapLimits?.targetBalance?.toString() ?? ''}
              onChangeText={v => {
                const num = parseInt(v, 10)
                if (!isNaN(num) && num >= 0 && num <= 100) {
                  handleSwapLimitsChange('targetBalance', num)
                }
              }}
              keyboardType="numeric"
              placeholder="50"
              placeholderTextColor={colors.placeholder}
            />
          </View>
        )}

        <View style={[styles.divider, isDark && styles.dividerDark]} />

        <Text style={[styles.subsectionTitle, isDark && styles.subsectionTitleDark]}>Limites</Text>

        <View style={styles.limitsGrid}>
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, isDark && styles.limitLabelDark]}>Máx. Loop In</Text>
            <Text style={[styles.limitValue, isDark && styles.limitValueDark]}>
              {formatSats(lightning.swapLimits?.maxLoopInSats ?? 0)}
            </Text>
          </View>
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, isDark && styles.limitLabelDark]}>Máx. Loop Out</Text>
            <Text style={[styles.limitValue, isDark && styles.limitValueDark]}>
              {formatSats(lightning.swapLimits?.maxLoopOutSats ?? 0)}
            </Text>
          </View>
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, isDark && styles.limitLabelDark]}>Mínimo</Text>
            <Text style={[styles.limitValue, isDark && styles.limitValueDark]}>
              {formatSats(lightning.swapLimits?.minSwapSats ?? 0)}
            </Text>
          </View>
        </View>
      </Section>

      {/* ========== CANAIS ========== */}
      <Section title="Canais" icon="📡" isDark={isDark}>
        <SettingRow
          label="Zero-Conf Channels"
          description="Aceitar canais sem confirmação on-chain"
          isDark={isDark}
        >
          <Switch
            value={lightning.zeroConfEnabled ?? false}
            onValueChange={v => dispatch(actions.setZeroConfEnabled(v))}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow
          label="Gerenciamento Automático"
          description="Abrir/fechar canais conforme necessidade"
          isDark={isDark}
        >
          <Switch
            value={lightning.autoChannelManagement ?? false}
            onValueChange={v => dispatch(actions.setAutoChannelManagement(v))}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <View style={[styles.divider, isDark && styles.dividerDark]} />

        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>
            Tamanho Mínimo do Canal (sats)
          </Text>
          <TextInput
            style={[styles.textInput, isDark && styles.textInputDark]}
            value={lightning.feeConfig?.minChannelSize?.toString() ?? ''}
            onChangeText={v => {
              const num = parseInt(v, 10)
              if (!isNaN(num) && num >= 0) {
                dispatch(actions.setLightningFeeConfig({ minChannelSize: num }))
              }
            }}
            keyboardType="numeric"
            placeholder="100000"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Máximo de HTLCs</Text>
          <TextInput
            style={[styles.textInput, isDark && styles.textInputDark]}
            value={lightning.maxHtlcCount?.toString() ?? ''}
            onChangeText={v => {
              const num = parseInt(v, 10)
              if (!isNaN(num) && num >= 1 && num <= 483) {
                dispatch(actions.setMaxHtlcCount(num))
              }
            }}
            keyboardType="numeric"
            placeholder="30"
            placeholderTextColor={colors.placeholder}
          />
        </View>
      </Section>

      {/* ========== AVANÇADO ========== */}
      <Section title="Avançado" icon="⚙️" isDark={isDark} defaultExpanded={false}>
        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>
            Taxa Máxima de Roteamento (%)
          </Text>
          <TextInput
            style={[styles.textInput, isDark && styles.textInputDark]}
            value={lightning.advanced?.maxRoutingFeePercent?.toString() ?? ''}
            onChangeText={v => {
              const num = parseFloat(v)
              if (!isNaN(num) && num >= 0) {
                handleAdvancedChange('maxRoutingFeePercent', num)
              }
            }}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>
            Timeout de Pathfinding (segundos)
          </Text>
          <TextInput
            style={[styles.textInput, isDark && styles.textInputDark]}
            value={lightning.advanced?.pathfindingTimeout?.toString() ?? ''}
            onChangeText={v => {
              const num = parseInt(v, 10)
              if (!isNaN(num) && num >= 1) {
                handleAdvancedChange('pathfindingTimeout', num)
              }
            }}
            keyboardType="numeric"
            placeholder="60"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>Máximo de Hops</Text>
          <TextInput
            style={[styles.textInput, isDark && styles.textInputDark]}
            value={lightning.advanced?.maxHops?.toString() ?? ''}
            onChangeText={v => {
              const num = parseInt(v, 10)
              if (!isNaN(num) && num >= 1 && num <= 30) {
                handleAdvancedChange('maxHops', num)
              }
            }}
            keyboardType="numeric"
            placeholder="20"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, isDark && styles.inputLabelDark]}>
            CLTV Expiry Padrão (blocos)
          </Text>
          <TextInput
            style={[styles.textInput, isDark && styles.textInputDark]}
            value={lightning.defaultCltvExpiry?.toString() ?? ''}
            onChangeText={v => {
              const num = parseInt(v, 10)
              if (!isNaN(num) && num >= 9) {
                dispatch(actions.setDefaultCltvExpiry(num))
              }
            }}
            keyboardType="numeric"
            placeholder="144"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <SettingRow
          label="Permitir Canais Legacy"
          description="Aceitar canais sem anchor outputs"
          isDark={isDark}
        >
          <Switch
            value={lightning.advanced?.allowLegacyChannels ?? false}
            onValueChange={v => handleAdvancedChange('allowLegacyChannels', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>
      </Section>
    </View>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
  },
  section: {
    backgroundColor: colors.white,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sectionDark: {
    backgroundColor: alpha(colors.white, 0.05),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIcon: {
    fontSize: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.light,
  },
  sectionTitleDark: {
    color: colors.text.dark,
  },
  sectionContent: {
    padding: 16,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
    color: colors.textSecondary.light,
  },
  subsectionTitleDark: {
    color: colors.textSecondary.dark,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 56,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.light,
  },
  settingLabelDark: {
    color: colors.text.dark,
  },
  settingDescription: {
    fontSize: 12,
    marginTop: 2,
    color: colors.textSecondary.light,
  },
  settingDescriptionDark: {
    color: colors.textSecondary.dark,
  },
  settingControl: {
    alignItems: 'flex-end',
  },
  divider: {
    height: 1,
    marginVertical: 12,
    backgroundColor: colors.divider,
  },
  dividerDark: {
    backgroundColor: colors.border.dark,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  networkLabel: {
    fontSize: 13,
    color: colors.textSecondary.light,
  },
  networkLabelDark: {
    color: colors.textSecondary.dark,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    backgroundColor: alpha(colors.primary, 0.08),
  },
  statBoxDark: {
    backgroundColor: alpha(colors.primary, 0.15),
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
    color: colors.textSecondary.light,
  },
  statLabelDark: {
    color: colors.textSecondary.dark,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.divider,
  },
  optionRowDark: {
    backgroundColor: colors.border.dark,
  },
  optionRowSelected: {
    backgroundColor: alpha(colors.primary, 0.12),
  },
  optionLabel: {
    fontSize: 14,
    color: colors.text.light,
  },
  optionLabelDark: {
    color: colors.text.dark,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 8,
    color: colors.textSecondary.light,
  },
  inputLabelDark: {
    color: colors.textSecondary.dark,
  },
  textInput: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: colors.divider,
    color: colors.text.light,
  },
  textInputDark: {
    backgroundColor: colors.border.dark,
    color: colors.text.dark,
  },
  limitsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  limitItem: {
    flex: 1,
    alignItems: 'center',
  },
  limitLabel: {
    fontSize: 11,
    marginBottom: 4,
    color: colors.textSecondary.light,
  },
  limitLabelDark: {
    color: colors.textSecondary.dark,
  },
  limitValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.light,
  },
  limitValueDark: {
    color: colors.text.dark,
  },
  networkButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  networkButtonDark: {
    backgroundColor: colors.primary,
  },
  networkButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.background.light,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 300,
  },
  modalContentDark: {
    backgroundColor: colors.secondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: colors.text.light,
  },
  modalTitleDark: {
    color: colors.text.dark,
  },
  networkOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: colors.divider,
  },
  networkOptionDark: {
    backgroundColor: colors.border.dark,
  },
  networkOptionSelected: {
    backgroundColor: colors.primary,
  },
  networkOptionText: {
    fontSize: 16,
    textAlign: 'center',
    color: colors.text.light,
  },
  networkOptionTextDark: {
    color: colors.text.dark,
  },
  networkOptionTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
})
