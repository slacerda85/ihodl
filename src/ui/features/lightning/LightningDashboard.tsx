/**
 * LightningDashboard
 *
 * Dashboard completo para configurações e monitoramento Lightning Network.
 * Organizado em seções para fácil navegação.
 *
 * Seções:
 * 1. Status & Connection
 * 2. Liquidity Management
 * 3. Channels
 * 4. Routing & Payments
 * 5. Privacy
 * 6. Backup & Recovery
 * 7. Watchtower
 * 8. Submarine Swaps
 * 9. Advanced
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
  Alert,
  ViewStyle,
  TextStyle,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import {
  useLightningSettings,
  useActiveColorMode,
  useSettingsActions,
} from '@/ui/features/app-provider'
import {
  useLightningState,
  useLightningActions,
  useConnectionState,
  useInboundBalance,
} from './hooks'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import Button from '@/ui/components/Button'
import type {
  RoutingStrategy,
  WatchtowerConfig,
  BackupConfig,
  PrivacyConfig,
  SwapLimitsConfig,
  AdvancedConfig,
  LiquidityConfig,
  SwapInConfig,
} from '../settings/state'

// ==========================================
// TYPES
// ==========================================

type ColorMode = 'light' | 'dark'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LightningDashboardProps {}

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

export default function LightningDashboard() {
  const router = useRouter()
  const colorMode = useActiveColorMode()
  const lightningSettings = useLightningSettings()
  const settingsActions = useSettingsActions()
  const connectionState = useConnectionState()
  const lightningState = useLightningState()
  const lightningActions = useLightningActions()
  const inboundBalance = useInboundBalance()

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
    settingsActions.setPrivacyConfig({ [key]: value })
  }

  const handleWatchtowerChange = (
    key: keyof WatchtowerConfig,
    value: boolean | string | number,
  ) => {
    settingsActions.setWatchtowerConfig({ [key]: value })
  }

  const handleBackupChange = (key: keyof BackupConfig, value: boolean | string) => {
    settingsActions.setBackupConfig({ [key]: value })
  }

  const handleSwapLimitsChange = (key: keyof SwapLimitsConfig, value: number | boolean) => {
    settingsActions.setSwapLimits({ [key]: value })
  }

  const handleSwapInChange = (key: keyof SwapInConfig, value: number | boolean) => {
    settingsActions.setSwapInConfig({ [key]: value })
  }

  const handleAdvancedChange = (
    key: keyof AdvancedConfig,
    value: number | boolean | RoutingStrategy,
  ) => {
    settingsActions.setAdvancedConfig({ [key]: value })
  }

  const handleLiquidityChange = (config: Partial<LiquidityConfig>) => {
    settingsActions.setLiquidityConfig(config)
  }

  const handleRoutingStrategyChange = (strategy: RoutingStrategy) => {
    settingsActions.setRoutingStrategy(strategy)
  }

  const handleTrampolineNodeToggle = (nodeId: string, enabled: boolean) => {
    const node = lightningSettings.trampolineNodes?.find(n => n.nodeId === nodeId)
    if (node) {
      settingsActions.updateTrampolineNode({ ...node, enabled })
    }
  }

  const formatSats = (sats: bigint | number) => {
    const numSats = typeof sats === 'bigint' ? Number(sats) : sats
    if (numSats >= 100000000) {
      return `${(numSats / 100000000).toFixed(2)} BTC`
    } else if (numSats >= 1000000) {
      return `${(numSats / 1000000).toFixed(2)}M sats`
    } else if (numSats >= 1000) {
      return `${(numSats / 1000).toFixed(1)}k sats`
    }
    return `${numSats} sats`
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
            Rede: {lightningSettings.network?.toUpperCase() ?? 'MAINNET'}
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

        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: alpha(colors.primary, colorMode === 'dark' ? 0.2 : 0.1),
            },
          ]}
          onPress={() => router.push('/(tabs)/lightning/channels')}
        >
          <Text style={styles.actionButtonText}>Ver Todos os Canais</Text>
          <IconSymbol name="chevron.right" size={16} color={colors.primary} />
        </TouchableOpacity>

        {/* Quick Actions - Enviar/Receber */}
        <View style={styles.actionsRow}>
          <Button
            onPress={() => router.push('/(tabs)/lightning/paymentSend')}
            style={{ flex: 1 }}
            tintColor={alpha(colors.primary, 0.9)}
          >
            <Text style={styles.buttonText}>Enviar</Text>
          </Button>

          <Button
            onPress={() => router.push('/(tabs)/lightning/paymentReceive')}
            style={{ flex: 1 }}
          >
            <Text
              style={[
                styles.buttonTextSecondary,
                colorMode === 'dark' && styles.buttonTextSecondaryDark,
              ]}
            >
              Receber
            </Text>
          </Button>
        </View>

        {/* Channel Actions */}
        <View style={styles.actionsRow}>
          <Button
            onPress={() => router.push('/(tabs)/lightning/channelCreate')}
            style={{ flex: 1 }}
            variant="glass"
          >
            <Text style={styles.glassButtonText}>Abrir Canal</Text>
          </Button>

          <Button
            onPress={() => router.push('/(tabs)/lightning/dualFunding')}
            style={{ flex: 1 }}
            variant="glass"
          >
            <Text style={styles.glassButtonText}>Dual Funding</Text>
          </Button>
        </View>
      </Section>

      {/* ========== SECTION 2: LIQUIDITY MANAGEMENT ========== */}
      <Section title="Gerenciamento de Liquidez" icon="💧" colorMode={colorMode}>
        <SettingRow
          label="Política de Abertura"
          description="Como abrir canais automaticamente"
          colorMode={colorMode}
        >
          <View style={styles.pickerContainer}>
            <TouchableOpacity
              style={[
                styles.pickerOption,
                lightningSettings?.liquidity?.type === 'disable' && styles.pickerOptionSelected,
                { backgroundColor: alpha(colors.border[colorMode], 0.5) },
              ]}
              onPress={() => handleLiquidityChange({ type: 'disable' })}
            >
              <Text
                style={[
                  styles.pickerOptionText,
                  { color: colors.text[colorMode] },
                  lightningSettings?.liquidity?.type === 'disable' &&
                    styles.pickerOptionTextSelected,
                ]}
              >
                Desabilitado
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.pickerOption,
                lightningSettings?.liquidity?.type === 'auto' && styles.pickerOptionSelected,
                { backgroundColor: alpha(colors.border[colorMode], 0.5) },
              ]}
              onPress={() => handleLiquidityChange({ type: 'auto' })}
            >
              <Text
                style={[
                  styles.pickerOptionText,
                  { color: colors.text[colorMode] },
                  lightningSettings?.liquidity?.type === 'auto' && styles.pickerOptionTextSelected,
                ]}
              >
                Automático
              </Text>
            </TouchableOpacity>
          </View>
        </SettingRow>

        {lightningSettings?.liquidity?.type === 'auto' && (
          <>
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
                Taxa Máxima Absoluta (sats)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: alpha(colors.border[colorMode], 0.5),
                    color: colors.text[colorMode],
                  },
                ]}
                value={lightningSettings.liquidity.maxAbsoluteFee?.toString() ?? ''}
                onChangeText={v => {
                  const num = parseInt(v, 10)
                  if (!isNaN(num) && num >= 0) {
                    handleLiquidityChange({ maxAbsoluteFee: num })
                  }
                }}
                keyboardType="number-pad"
                placeholder="5000"
                placeholderTextColor={colors.placeholder}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
                Taxa Máxima Relativa (%)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: alpha(colors.border[colorMode], 0.5),
                    color: colors.text[colorMode],
                  },
                ]}
                value={
                  (lightningSettings.liquidity.maxRelativeFeeBasisPoints / 100)?.toString() ?? ''
                }
                onChangeText={v => {
                  const num = parseFloat(v)
                  if (!isNaN(num) && num >= 0 && num <= 100) {
                    handleLiquidityChange({ maxRelativeFeeBasisPoints: Math.floor(num * 100) })
                  }
                }}
                keyboardType="decimal-pad"
                placeholder="50"
                placeholderTextColor={colors.placeholder}
              />
            </View>

            <SettingRow
              label="Pular Verificação Absoluta"
              description="Permitir taxas acima do limite absoluto em casos especiais"
              colorMode={colorMode}
            >
              <Switch
                value={lightningSettings.liquidity.skipAbsoluteFeeCheck ?? false}
                onValueChange={v => handleLiquidityChange({ skipAbsoluteFeeCheck: v })}
                trackColor={{ false: colors.disabled, true: colors.primary }}
                thumbColor={colors.white}
              />
            </SettingRow>
          </>
        )}

        <View style={styles.divider} />

        <SettingRow
          label="Swap-In Automático"
          description="Converter automaticamente fundos on-chain para Lightning"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings?.swapIn?.enabled ?? false}
            onValueChange={v => handleSwapInChange('enabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        {lightningSettings?.swapIn?.enabled && (
          <>
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
                Taxa Máxima para Swap-In (sats)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: alpha(colors.border[colorMode], 0.5),
                    color: colors.text[colorMode],
                  },
                ]}
                value={lightningSettings.swapIn.maxAbsoluteFee?.toString() ?? ''}
                onChangeText={v => {
                  const num = parseInt(v, 10)
                  if (!isNaN(num) && num >= 0) {
                    handleSwapInChange('maxAbsoluteFee', num)
                  }
                }}
                keyboardType="number-pad"
                placeholder="5000"
                placeholderTextColor={colors.placeholder}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
                Taxa Máxima Relativa (%)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: alpha(colors.border[colorMode], 0.5),
                    color: colors.text[colorMode],
                  },
                ]}
                value={
                  (lightningSettings?.swapIn?.maxRelativeFeeBasisPoints / 100)?.toString() ?? ''
                }
                onChangeText={v => {
                  const num = parseFloat(v)
                  if (!isNaN(num) && num >= 0 && num <= 100) {
                    handleSwapInChange('maxRelativeFeeBasisPoints', Math.floor(num * 100))
                  }
                }}
                keyboardType="decimal-pad"
                placeholder="50"
                placeholderTextColor={colors.placeholder}
              />
            </View>
          </>
        )}
      </Section>

      {/* ========== SECTION 3: CHANNELS ========== */}
      <Section title="Canais" icon="📡" colorMode={colorMode}>
        <SettingRow
          label="Trampoline Routing"
          description="Delega cálculo de rota para nós intermediários"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.trampolineRoutingEnabled ?? false}
            onValueChange={v => settingsActions.setTrampolineRouting(v)}
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
            value={lightningSettings.mppEnabled ?? false}
            onValueChange={v => settingsActions.setMppEnabled(v)}
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
                    lightningSettings.advanced?.routingStrategy === strategy
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
              {lightningSettings.advanced?.routingStrategy === strategy && (
                <IconSymbol name="checkmark" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ),
        )}

        {lightningSettings.trampolineRoutingEnabled && (
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
            {lightningSettings.trampolineNodes?.map(node => (
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

      {/* ========== SECTION 4: ROUTING & PAYMENTS ========== */}
      <Section title="Roteamento & Pagamentos" icon="🔀" colorMode={colorMode}>
        <SettingRow
          label="Trampoline Routing"
          description="Delega cálculo de rota para nós intermediários"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.trampolineRoutingEnabled ?? false}
            onValueChange={v => settingsActions.setTrampolineRouting(v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow
          label="MPP (Multi-Part Payments)"
          description="Permite pagamentos divididos em múltiplas partes"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.mppEnabled ?? true}
            onValueChange={v => settingsActions.setMppEnabled(v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <SettingRow
          label="Zero-Conf Channels"
          description="Aceitar canais sem confirmação on-chain"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.zeroConfEnabled ?? false}
            onValueChange={v => settingsActions.setZeroConfEnabled(v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        {lightningSettings.trampolineRoutingEnabled && (
          <>
            <View style={styles.divider} />

            <Text style={[styles.subsectionTitle, { color: colors.textSecondary[colorMode] }]}>
              Nós Trampoline
            </Text>

            {lightningSettings.trampolineNodes?.map(node => (
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

      {/* ========== SECTION 5: PRIVACY ========== */}
      <Section title="Privacidade" icon="🔒" colorMode={colorMode}>
        <SettingRow
          label="Blinded Paths"
          description="Ocultar identidade do destinatário nos pagamentos"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.privacy?.blindedPathsEnabled ?? false}
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
            value={lightningSettings.privacy?.onionMessagesEnabled ?? false}
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
            value={lightningSettings.privacy?.usePrivateChannelsOnly ?? false}
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
            value={lightningSettings.privacy?.hiddenNode ?? false}
            onValueChange={v => handlePrivacyChange('hiddenNode', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>
      </Section>

      {/* ========== SECTION 5: BACKUP & RECOVERY ========== */}
      <Section title="Backup & Recuperação" icon="💾" colorMode={colorMode}>
        <SettingRow
          label="Backup Automático"
          description="Fazer backup automaticamente quando estado mudar"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.backup?.autoBackupEnabled ?? false}
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
            value={lightningSettings.backup?.encryptWithPassword ?? false}
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
                  lightningSettings.backup?.cloudProvider === provider
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
            {lightningSettings.backup?.cloudProvider === provider && (
              <IconSymbol name="checkmark" size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        ))}

        {/* Backup screen is in settings */}
      </Section>

      {/* ========== SECTION 6: WATCHTOWER ========== */}
      <Section title="Watchtower" icon="👁️" colorMode={colorMode}>
        <SettingRow
          label="Watchtower Local"
          description="Monitorar canais neste dispositivo"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.watchtower?.localEnabled ?? false}
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
            value={lightningSettings.watchtower?.remoteEnabled ?? false}
            onValueChange={v => handleWatchtowerChange('remoteEnabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        {lightningSettings.watchtower?.remoteEnabled && (
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
              value={lightningSettings.watchtower?.remoteUrl ?? ''}
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
            value={lightningSettings.watchtower?.autoUploadRevocations ?? false}
            onValueChange={v => handleWatchtowerChange('autoUploadRevocations', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: alpha(colors.primary, colorMode === 'dark' ? 0.2 : 0.1),
            },
          ]}
          onPress={() => router.push('/(tabs)/lightning/watchtower')}
        >
          <Text style={styles.actionButtonText}>Gerenciar Watchtowers</Text>
          <IconSymbol name="chevron.right" size={16} color={colors.primary} />
        </TouchableOpacity>
      </Section>

      {/* ========== SECTION 7: SUBMARINE SWAPS ========== */}
      <Section title="Submarine Swaps" icon="🔄" colorMode={colorMode}>
        <SettingRow
          label="Auto-Swap"
          description="Balancear automaticamente on-chain e Lightning"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.swapLimits?.autoSwapEnabled ?? false}
            onValueChange={v => handleSwapLimitsChange('autoSwapEnabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        {lightningSettings.swapLimits?.autoSwapEnabled && (
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
              value={lightningSettings.swapLimits?.targetBalance?.toString() ?? ''}
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
          Swap-In Automático
        </Text>

        <SettingRow
          label="Habilitado"
          description="Converter automaticamente saldo on-chain para Lightning"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.swapIn?.enabled ?? false}
            onValueChange={v => handleSwapInChange('enabled', v)}
            trackColor={{ false: colors.disabled, true: colors.primary }}
            thumbColor={colors.white}
          />
        </SettingRow>

        {lightningSettings.swapIn?.enabled && (
          <>
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
                Taxa Máxima Absoluta (sats)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: alpha(colors.border[colorMode], 0.5),
                    color: colors.text[colorMode],
                  },
                ]}
                value={lightningSettings.swapIn?.maxAbsoluteFee?.toString() ?? ''}
                onChangeText={v => {
                  const num = parseInt(v, 10)
                  if (!isNaN(num) && num >= 0) {
                    handleSwapInChange('maxAbsoluteFee', num)
                  }
                }}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={colors.placeholder}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary[colorMode] }]}>
                Taxa Máxima Relativa (%)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: alpha(colors.border[colorMode], 0.5),
                    color: colors.text[colorMode],
                  },
                ]}
                value={(
                  (lightningSettings.swapIn?.maxRelativeFeeBasisPoints ?? 0) / 100
                ).toString()}
                onChangeText={v => {
                  const num = parseFloat(v)
                  if (!isNaN(num) && num >= 0 && num <= 100) {
                    handleSwapInChange('maxRelativeFeeBasisPoints', Math.floor(num * 100))
                  }
                }}
                keyboardType="numeric"
                placeholder="0.5"
                placeholderTextColor={colors.placeholder}
              />
            </View>

            <SettingRow
              label="Pular Verificação Absoluta"
              description="Ignorar limite de taxa absoluta"
              colorMode={colorMode}
            >
              <Switch
                value={lightningSettings.swapIn?.skipAbsoluteFeeCheck ?? false}
                onValueChange={v => handleSwapInChange('skipAbsoluteFeeCheck', v)}
                trackColor={{ false: colors.disabled, true: colors.primary }}
                thumbColor={colors.white}
              />
            </SettingRow>
          </>
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
              {formatSats(lightningSettings.swapLimits?.maxLoopInSats ?? 0)}
            </Text>
          </View>
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, { color: colors.textSecondary[colorMode] }]}>
              Máx. Loop Out
            </Text>
            <Text style={[styles.limitValue, { color: colors.text[colorMode] }]}>
              {formatSats(lightningSettings.swapLimits?.maxLoopOutSats ?? 0)}
            </Text>
          </View>
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, { color: colors.textSecondary[colorMode] }]}>
              Mínimo
            </Text>
            <Text style={[styles.limitValue, { color: colors.text[colorMode] }]}>
              {formatSats(lightningSettings.swapLimits?.minSwapSats ?? 0)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor: alpha(colors.primary, colorMode === 'dark' ? 0.2 : 0.1),
            },
          ]}
          onPress={() => router.push('/(tabs)/lightning/swap')}
        >
          <Text style={styles.actionButtonText}>Realizar Swap</Text>
          <IconSymbol name="chevron.right" size={16} color={colors.primary} />
        </TouchableOpacity>

        {/* Pending Swap-In Balance */}
        {inboundBalance.pendingOnChainBalance > 0n && (
          <View style={[styles.pendingBalanceCard, { backgroundColor: alpha(colors.info, 0.1) }]}>
            <View style={styles.pendingBalanceHeader}>
              <Text style={[styles.pendingBalanceTitle, { color: colors.info }]}>
                💰 Saldo On-Chain Pendente
              </Text>
              <Text style={[styles.pendingBalanceAmount, { color: colors.text[colorMode] }]}>
                {formatSats(inboundBalance.pendingOnChainBalance)}
              </Text>
            </View>

            {inboundBalance.willAutoConvert ? (
              <Text style={[styles.pendingBalanceNote, { color: colors.textSecondary[colorMode] }]}>
                Será convertido automaticamente para Lightning
              </Text>
            ) : (
              <TouchableOpacity
                style={[styles.convertButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  // TODO: Implementar conversão manual
                  Alert.alert('Conversão Manual', 'Funcionalidade em desenvolvimento')
                }}
              >
                <Text style={styles.convertButtonText}>Converter Agora</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Section>

      {/* ========== SECTION 8: CHANNELS ========== */}
      <Section title="Canais" icon="📡" colorMode={colorMode}>
        <SettingRow
          label="Zero-Conf Channels"
          description="Aceitar canais sem confirmação on-chain"
          colorMode={colorMode}
        >
          <Switch
            value={lightningSettings.zeroConfEnabled ?? false}
            onValueChange={v => settingsActions.setZeroConfEnabled(v)}
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
            value={lightningSettings.autoChannelManagement ?? false}
            onValueChange={v => settingsActions.setAutoChannelManagement(v)}
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
            value={lightningSettings.feeConfig?.minChannelSize?.toString() ?? ''}
            onChangeText={v => {
              const num = parseInt(v, 10)
              if (!isNaN(num) && num >= 0) {
                settingsActions.setLightningFeeConfig({ minChannelSize: num })
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
            value={lightningSettings.maxHtlcCount?.toString() ?? ''}
            onChangeText={v => {
              const num = parseInt(v, 10)
              if (!isNaN(num) && num >= 1 && num <= 483) {
                settingsActions.setMaxHtlcCount(num)
              }
            }}
            keyboardType="numeric"
            placeholder="30"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <View style={styles.channelActionsGrid}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                flex: 1,
                backgroundColor: alpha(colors.primary, colorMode === 'dark' ? 0.2 : 0.1),
              },
            ]}
            onPress={() => router.push('/(tabs)/lightning/channels')}
          >
            <Text style={styles.actionButtonText}>Gerenciar</Text>
            <IconSymbol name="chevron.right" size={16} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              { flex: 1, backgroundColor: alpha(colors.info, colorMode === 'dark' ? 0.2 : 0.1) },
            ]}
            onPress={() => router.push('/(tabs)/lightning/splice')}
          >
            <Text style={[styles.actionButtonText, { color: colors.info }]}>Splice</Text>
            <IconSymbol name="chevron.right" size={16} color={colors.info} />
          </TouchableOpacity>
        </View>
      </Section>

      {/* ========== SECTION 9: ADVANCED ========== */}
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
            value={lightningSettings.advanced?.maxRoutingFeePercent?.toString() ?? ''}
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
            value={lightningSettings.advanced?.pathfindingTimeout?.toString() ?? ''}
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
            value={lightningSettings.advanced?.maxHops?.toString() ?? ''}
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
            value={lightningSettings.defaultCltvExpiry?.toString() ?? ''}
            onChangeText={v => {
              const num = parseInt(v, 10)
              if (!isNaN(num) && num >= 9) {
                settingsActions.setDefaultCltvExpiry(num)
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
            value={lightningSettings.advanced?.allowLegacyChannels ?? false}
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
    minWidth: 120,
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  buttonText: {
    color: colors.white,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
  },
  buttonTextSecondary: {
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
    color: colors.textSecondary.light,
  },
  buttonTextSecondaryDark: {
    color: alpha(colors.textSecondary.dark, 0.85),
  },
  glassButtonText: {
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '500',
    fontSize: 16,
  },
  channelActionsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  pickerContainer: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  pickerOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  pickerOptionSelected: {
    backgroundColor: colors.primary,
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pickerOptionTextSelected: {
    color: colors.white,
  },
  pendingBalanceCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: alpha(colors.info, 0.3),
  } as ViewStyle,
  pendingBalanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  } as ViewStyle,
  pendingBalanceTitle: {
    fontSize: 14,
    fontWeight: '600',
  } as TextStyle,
  pendingBalanceAmount: {
    fontSize: 16,
    fontWeight: '700',
  } as TextStyle,
  pendingBalanceNote: {
    fontSize: 12,
    fontStyle: 'italic',
  } as TextStyle,
  convertButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  } as ViewStyle,
  convertButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  } as TextStyle,
})
