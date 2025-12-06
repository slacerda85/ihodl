/**
 * LightningDashboard
 *
 * Dashboard completo para configurações e monitoramento Lightning Network.
 * Organizado em seções para fácil navegação.
 *
 * Seções:
 * 1. Status & Connection
 * 2. Channels
 * 3. Routing & Payments
 * 4. Privacy
 * 5. Backup & Recovery
 * 6. Watchtower
 * 7. Submarine Swaps
 * 8. Advanced
 */

import React, { useState, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { useSettings, useActiveColorMode } from '../settings'
import { useLightningState, useLightningActions, useConnectionState } from './hooks'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import type {
  RoutingStrategy,
  WatchtowerConfig,
  BackupConfig,
  PrivacyConfig,
  SwapLimitsConfig,
  AdvancedConfig,
} from '../settings/state'

// ==========================================
// TYPES
// ==========================================

type ColorMode = 'light' | 'dark'

export interface LightningDashboardProps {
  onNavigate?: (screen: string) => void
}

interface SectionProps {
  title: string
  icon: string
  colorMode: ColorMode
  children: React.ReactNode
  collapsible?: boolean
  defaultExpanded?: boolean
}

interface SettingRowProps {
  label: string
  description?: string
  colorMode: ColorMode
  children: React.ReactNode
}

// ==========================================
// COMPONENTS
// ==========================================

const Section: React.FC<SectionProps> = ({
  title,
  icon,
  colorMode,
  children,
  collapsible = true,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <View
      style={[
        styles.section,
        { backgroundColor: colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white },
      ]}
    >
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => collapsible && setExpanded(!expanded)}
        disabled={!collapsible}
      >
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionIcon}>{icon}</Text>
          <Text style={[styles.sectionTitle, { color: colors.text[colorMode] }]}>{title}</Text>
        </View>
        {collapsible && (
          <IconSymbol
            name={expanded ? 'chevron.up' : 'chevron.down'}
            size={20}
            color={colors.textSecondary[colorMode]}
          />
        )}
      </TouchableOpacity>
      {expanded && <View style={styles.sectionContent}>{children}</View>}
    </View>
  )
}

const SettingRow: React.FC<SettingRowProps> = ({ label, description, colorMode, children }) => (
  <View style={styles.settingRow}>
    <View style={styles.settingInfo}>
      <Text style={[styles.settingLabel, { color: colors.text[colorMode] }]}>{label}</Text>
      {description && (
        <Text style={[styles.settingDescription, { color: colors.textSecondary[colorMode] }]}>
          {description}
        </Text>
      )}
    </View>
    <View style={styles.settingControl}>{children}</View>
  </View>
)

const StatusBadge: React.FC<{
  status: 'connected' | 'disconnected'
}> = ({ status }) => {
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

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function LightningDashboard({ onNavigate }: LightningDashboardProps) {
  const colorMode = useActiveColorMode()
  const { lightning, dispatch, actions } = useSettings()
  const connectionState = useConnectionState()
  const lightningState = useLightningState()
  const lightningActions = useLightningActions()

  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await lightningActions.refreshBalance()
    } catch (error) {
      console.error('Error refreshing:', error)
    } finally {
      setRefreshing(false)
    }
  }, [lightningActions])

  // Handlers for settings changes
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
    if (connectionState.isConnected) return 'connected'
    return 'disconnected'
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background[colorMode] }]}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ========== SECTION 1: STATUS & CONNECTION ========== */}
      <Section title="Status & Conexão" icon="⚡" colorMode={colorMode} collapsible={false}>
        <View style={styles.statusContainer}>
          <StatusBadge status={getConnectionStatus()} />
          <Text style={[styles.networkLabel, { color: colors.textSecondary[colorMode] }]}>
            Rede: {lightning.network?.toUpperCase() ?? 'MAINNET'}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: alpha(colors.primary, colorMode === 'dark' ? 0.15 : 0.08),
              },
            ]}
          >
            <Text style={styles.statValue}>{lightningState.channels?.length ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary[colorMode] }]}>
              Canais
            </Text>
          </View>
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: alpha(colors.primary, colorMode === 'dark' ? 0.15 : 0.08),
              },
            ]}
          >
            <Text style={styles.statValue}>
              {formatSats(Number(lightningState.totalBalance ?? 0))}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary[colorMode] }]}>
              Saldo
            </Text>
          </View>
          <View
            style={[
              styles.statBox,
              {
                backgroundColor: alpha(colors.primary, colorMode === 'dark' ? 0.15 : 0.08),
              },
            ]}
          >
            <Text style={styles.statValue}>
              {lightningState.channels?.filter(c => c.isActive).length ?? 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary[colorMode] }]}>
              Ativos
            </Text>
          </View>
        </View>

        {onNavigate && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor: alpha(colors.primary, colorMode === 'dark' ? 0.2 : 0.1),
              },
            ]}
            onPress={() => onNavigate('channels')}
          >
            <Text style={styles.actionButtonText}>Ver Todos os Canais</Text>
            <IconSymbol name="chevron.right" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </Section>

      {/* ========== SECTION 2: ROUTING & PAYMENTS ========== */}
      <Section title="Roteamento & Pagamentos" icon="🔀" colorMode={colorMode}>
        <SettingRow
          label="Trampoline Routing"
          description="Delega cálculo de rota para nós intermediários"
          colorMode={colorMode}
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
          colorMode={colorMode}
        >
          <Switch
            value={lightning.mppEnabled ?? false}
            onValueChange={v => dispatch(actions.setMppEnabled(v))}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <View
          style={[
            styles.divider,
            {
              backgroundColor: alpha(colors.border[colorMode], colorMode === 'dark' ? 0.3 : 0.5),
            },
          ]}
        />

        <Text style={[styles.subsectionTitle, { color: colors.textSecondary[colorMode] }]}>
          Estratégia de Roteamento
        </Text>

        {(['lowest_fee', 'fastest', 'most_reliable', 'balanced'] as RoutingStrategy[])?.map(
          strategy => (
            <TouchableOpacity
              key={strategy}
              style={[
                styles.optionRow,
                {
                  backgroundColor:
                    lightning.advanced?.routingStrategy === strategy
                      ? alpha(colors.primary, 0.12)
                      : alpha(colors.border[colorMode], 0.3),
                },
              ]}
              onPress={() => handleRoutingStrategyChange(strategy)}
            >
              <Text style={[styles.optionLabel, { color: colors.text[colorMode] }]}>
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
            <View
              style={[
                styles.divider,
                {
                  backgroundColor: alpha(
                    colors.border[colorMode],
                    colorMode === 'dark' ? 0.3 : 0.5,
                  ),
                },
              ]}
            />
            <Text style={[styles.subsectionTitle, { color: colors.textSecondary[colorMode] }]}>
              Nós Trampoline Preferidos
            </Text>
            {lightning.trampolineNodes?.map(node => (
              <SettingRow
                key={node.nodeId}
                label={node.alias}
                description={`Prioridade: ${node.priority}`}
                colorMode={colorMode}
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

      {/* ========== SECTION 3: PRIVACY ========== */}
      <Section title="Privacidade" icon="🔒" colorMode={colorMode}>
        <SettingRow
          label="Blinded Paths"
          description="Ocultar identidade do destinatário nos pagamentos"
          colorMode={colorMode}
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
          colorMode={colorMode}
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
          colorMode={colorMode}
        >
          <Switch
            value={lightning.privacy?.usePrivateChannelsOnly ?? false}
            onValueChange={v => handlePrivacyChange('usePrivateChannelsOnly', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow
          label="Nó Oculto"
          description="Não revelar IP/identidade do nó"
          colorMode={colorMode}
        >
          <Switch
            value={lightning.privacy?.hiddenNode ?? false}
            onValueChange={v => handlePrivacyChange('hiddenNode', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>
      </Section>

      {/* ========== SECTION 4: BACKUP & RECOVERY ========== */}
      <Section title="Backup & Recuperação" icon="💾" colorMode={colorMode}>
        <SettingRow
          label="Backup Automático"
          description="Fazer backup automaticamente quando estado mudar"
          colorMode={colorMode}
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
          colorMode={colorMode}
        >
          <Switch
            value={lightning.backup?.encryptWithPassword ?? false}
            onValueChange={v => handleBackupChange('encryptWithPassword', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <View
          style={[
            styles.divider,
            {
              backgroundColor: alpha(colors.border[colorMode], colorMode === 'dark' ? 0.3 : 0.5),
            },
          ]}
        />

        <Text style={[styles.subsectionTitle, { color: colors.textSecondary[colorMode] }]}>
          Provedor de Nuvem
        </Text>

        {(['none', 'icloud', 'gdrive'] as const)?.map(provider => (
          <TouchableOpacity
            key={provider}
            style={[
              styles.optionRow,
              {
                backgroundColor:
                  lightning.backup?.cloudProvider === provider
                    ? alpha(colors.primary, 0.12)
                    : alpha(colors.border[colorMode], 0.3),
              },
            ]}
            onPress={() => handleBackupChange('cloudProvider', provider)}
          >
            <Text style={[styles.optionLabel, { color: colors.text[colorMode] }]}>
              {provider === 'none' && '📵 Nenhum (Local)'}
              {provider === 'icloud' && '☁️ iCloud'}
              {provider === 'gdrive' && '📁 Google Drive'}
            </Text>
            {lightning.backup?.cloudProvider === provider && (
              <IconSymbol name="checkmark" size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        ))}

        {onNavigate && (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary]}
            onPress={() => onNavigate('backup')}
          >
            <Text style={styles.actionButtonTextPrimary}>Gerenciar Backups</Text>
            <IconSymbol name="chevron.right" size={16} color={colors.white} />
          </TouchableOpacity>
        )}
      </Section>

      {/* ========== SECTION 5: WATCHTOWER ========== */}
      <Section title="Watchtower" icon="👁️" colorMode={colorMode}>
        <SettingRow
          label="Watchtower Local"
          description="Monitorar canais neste dispositivo"
          colorMode={colorMode}
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
          colorMode={colorMode}
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
            <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
              URL do Servidor
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: alpha(colors.border[colorMode], 0.5),
                  color: colors.text[colorMode],
                },
              ]}
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
          colorMode={colorMode}
        >
          <Switch
            value={lightning.watchtower?.autoUploadRevocations ?? false}
            onValueChange={v => handleWatchtowerChange('autoUploadRevocations', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>
      </Section>

      {/* ========== SECTION 6: SUBMARINE SWAPS ========== */}
      <Section title="Submarine Swaps" icon="🔄" colorMode={colorMode}>
        <SettingRow
          label="Auto-Swap"
          description="Balancear automaticamente on-chain e Lightning"
          colorMode={colorMode}
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
            <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
              Balanço Alvo (% Lightning)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: alpha(colors.border[colorMode], 0.5),
                  color: colors.text[colorMode],
                },
              ]}
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

        <View
          style={[
            styles.divider,
            {
              backgroundColor: alpha(colors.border[colorMode], colorMode === 'dark' ? 0.3 : 0.5),
            },
          ]}
        />

        <Text style={[styles.subsectionTitle, { color: colors.textSecondary[colorMode] }]}>
          Limites
        </Text>

        <View style={styles.limitsGrid}>
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, { color: colors.textSecondary[colorMode] }]}>
              Máx. Loop In
            </Text>
            <Text style={[styles.limitValue, { color: colors.text[colorMode] }]}>
              {formatSats(lightning.swapLimits?.maxLoopInSats ?? 0)}
            </Text>
          </View>
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, { color: colors.textSecondary[colorMode] }]}>
              Máx. Loop Out
            </Text>
            <Text style={[styles.limitValue, { color: colors.text[colorMode] }]}>
              {formatSats(lightning.swapLimits?.maxLoopOutSats ?? 0)}
            </Text>
          </View>
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, { color: colors.textSecondary[colorMode] }]}>
              Mínimo
            </Text>
            <Text style={[styles.limitValue, { color: colors.text[colorMode] }]}>
              {formatSats(lightning.swapLimits?.minSwapSats ?? 0)}
            </Text>
          </View>
        </View>

        {onNavigate && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor: alpha(colors.primary, colorMode === 'dark' ? 0.2 : 0.1),
              },
            ]}
            onPress={() => onNavigate('swap')}
          >
            <Text style={styles.actionButtonText}>Realizar Swap</Text>
            <IconSymbol name="chevron.right" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </Section>

      {/* ========== SECTION 7: CHANNELS ========== */}
      <Section title="Canais" icon="📡" colorMode={colorMode}>
        <SettingRow
          label="Zero-Conf Channels"
          description="Aceitar canais sem confirmação on-chain"
          colorMode={colorMode}
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
          colorMode={colorMode}
        >
          <Switch
            value={lightning.autoChannelManagement ?? false}
            onValueChange={v => dispatch(actions.setAutoChannelManagement(v))}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <View
          style={[
            styles.divider,
            {
              backgroundColor: alpha(colors.border[colorMode], colorMode === 'dark' ? 0.3 : 0.5),
            },
          ]}
        />

        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
            Tamanho Mínimo do Canal (sats)
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: alpha(colors.border[colorMode], 0.5),
                color: colors.text[colorMode],
              },
            ]}
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
          <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
            Máximo de HTLCs
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: alpha(colors.border[colorMode], 0.5),
                color: colors.text[colorMode],
              },
            ]}
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

      {/* ========== SECTION 8: ADVANCED ========== */}
      <Section title="Avançado" icon="⚙️" colorMode={colorMode} defaultExpanded={false}>
        <View style={styles.inputContainer}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
            Taxa Máxima de Roteamento (%)
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: alpha(colors.border[colorMode], 0.5),
                color: colors.text[colorMode],
              },
            ]}
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
          <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
            Timeout de Pathfinding (segundos)
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: alpha(colors.border[colorMode], 0.5),
                color: colors.text[colorMode],
              },
            ]}
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
          <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
            Máximo de Hops
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: alpha(colors.border[colorMode], 0.5),
                color: colors.text[colorMode],
              },
            ]}
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
          <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
            CLTV Expiry Padrão (blocos)
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: alpha(colors.border[colorMode], 0.5),
                color: colors.text[colorMode],
              },
            ]}
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
          colorMode={colorMode}
        >
          <Switch
            value={lightning.advanced?.allowLegacyChannels ?? false}
            onValueChange={v => handleAdvancedChange('allowLegacyChannels', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>
      </Section>

      {/* Bottom padding */}
      <View style={styles.bottomPadding} />
    </ScrollView>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  section: {
    borderRadius: 16,
    overflow: 'hidden',
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
  },
  sectionContent: {
    padding: 16,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
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
  },
  settingDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  settingControl: {
    alignItems: 'flex-end',
  },
  divider: {
    height: 1,
    marginVertical: 12,
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
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  actionButtonTextPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 14,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  textInput: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
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
  },
  limitValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 32,
  },
})
