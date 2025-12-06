/**
 * Watchtower Management Screen
 *
 * Tela para gerenciar watchtowers locais e remotos.
 * Permite adicionar, remover e monitorar o status dos watchtowers.
 */

import React, { useCallback, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useActiveColorMode } from '@/ui/features/app-provider'
import { useWatchtower } from '../useWatchtower'

// ==========================================
// TYPES
// ==========================================

interface RemoteWatchtower {
  id: string
  name: string
  url: string
  pubkey: string
  isConnected: boolean
  lastSeen?: number
  channelsMonitored: number
}

// ==========================================
// HELPERS
// ==========================================

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'Nunca'
  const date = new Date(timestamp)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

interface StatusCardProps {
  colorMode: 'light' | 'dark'
  isRunning: boolean
  monitoredChannels: number
  breachesDetected: number
  lastCheck: number
  onToggle: () => void
}

function StatusCard({
  colorMode,
  isRunning,
  monitoredChannels,
  breachesDetected,
  lastCheck,
  onToggle,
}: StatusCardProps) {
  const textColor = colors.text[colorMode]
  const secondaryColor = alpha(textColor, 0.6)
  const cardBg = colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <View style={styles.statusHeader}>
        <View style={styles.statusTitleRow}>
          <IconSymbol
            name="eye.fill"
            size={24}
            color={isRunning ? colors.success : colors.disabled}
          />
          <Text style={[styles.statusTitle, { color: textColor }]}>Watchtower Local</Text>
        </View>
        <Pressable
          style={[
            styles.statusToggle,
            { backgroundColor: isRunning ? colors.success : colors.disabled },
          ]}
          onPress={onToggle}
        >
          <Text style={styles.statusToggleText}>{isRunning ? 'ATIVO' : 'INATIVO'}</Text>
        </Pressable>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: textColor }]}>{monitoredChannels}</Text>
          <Text style={[styles.statLabel, { color: secondaryColor }]}>Canais</Text>
        </View>
        <View style={styles.statItem}>
          <Text
            style={[styles.statValue, { color: breachesDetected > 0 ? colors.error : textColor }]}
          >
            {breachesDetected}
          </Text>
          <Text style={[styles.statLabel, { color: secondaryColor }]}>Breaches</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: textColor }]}>{formatTimestamp(lastCheck)}</Text>
          <Text style={[styles.statLabel, { color: secondaryColor }]}>Última Verificação</Text>
        </View>
      </View>
    </View>
  )
}

interface RemoteWatchtowerCardProps {
  watchtower: RemoteWatchtower
  colorMode: 'light' | 'dark'
  onRemove: (id: string) => void
}

function RemoteWatchtowerCard({ watchtower, colorMode, onRemove }: RemoteWatchtowerCardProps) {
  const textColor = colors.text[colorMode]
  const secondaryColor = alpha(textColor, 0.6)
  const cardBg = colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white

  return (
    <View style={[styles.remoteCard, { backgroundColor: cardBg }]}>
      <View style={styles.remoteHeader}>
        <View
          style={[
            styles.connectionDot,
            { backgroundColor: watchtower.isConnected ? colors.success : colors.error },
          ]}
        />
        <View style={styles.remoteInfo}>
          <Text style={[styles.remoteName, { color: textColor }]}>{watchtower.name}</Text>
          <Text style={[styles.remoteUrl, { color: secondaryColor }]} numberOfLines={1}>
            {watchtower.url}
          </Text>
        </View>
        <Pressable style={styles.removeButton} onPress={() => onRemove(watchtower.id)}>
          <IconSymbol name="xmark.circle.fill" size={24} color={colors.error} />
        </Pressable>
      </View>

      <View style={styles.remoteStats}>
        <View style={styles.remoteStat}>
          <Text style={[styles.remoteStatLabel, { color: secondaryColor }]}>Pubkey</Text>
          <Text style={[styles.remoteStatValue, { color: textColor }]} numberOfLines={1}>
            {watchtower.pubkey.substring(0, 20)}...
          </Text>
        </View>
        <View style={styles.remoteStat}>
          <Text style={[styles.remoteStatLabel, { color: secondaryColor }]}>Canais</Text>
          <Text style={[styles.remoteStatValue, { color: textColor }]}>
            {watchtower.channelsMonitored}
          </Text>
        </View>
        <View style={styles.remoteStat}>
          <Text style={[styles.remoteStatLabel, { color: secondaryColor }]}>Último Contato</Text>
          <Text style={[styles.remoteStatValue, { color: textColor }]}>
            {formatTimestamp(watchtower.lastSeen)}
          </Text>
        </View>
      </View>
    </View>
  )
}

interface AddWatchtowerFormProps {
  colorMode: 'light' | 'dark'
  onAdd: (name: string, url: string, pubkey: string) => void
  onCancel: () => void
}

function AddWatchtowerForm({ colorMode, onAdd, onCancel }: AddWatchtowerFormProps) {
  const textColor = colors.text[colorMode]
  const cardBg = colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [pubkey, setPubkey] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = 'Nome é obrigatório'
    }

    if (!url.trim()) {
      newErrors.url = 'URL é obrigatória'
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      newErrors.url = 'URL inválida'
    }

    if (!pubkey.trim()) {
      newErrors.pubkey = 'Pubkey é obrigatória'
    } else if (pubkey.length !== 66) {
      newErrors.pubkey = 'Pubkey deve ter 66 caracteres (hex)'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [name, url, pubkey])

  const handleSubmit = useCallback(() => {
    if (validate()) {
      onAdd(name.trim(), url.trim(), pubkey.trim())
    }
  }, [validate, onAdd, name, url, pubkey])

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <Text style={[styles.sectionTitle, { color: textColor }]}>Adicionar Watchtower Remoto</Text>

      <View style={styles.formField}>
        <Text style={[styles.inputLabel, { color: textColor }]}>Nome</Text>
        <TextInput
          style={[
            styles.input,
            { color: textColor, borderColor: errors.name ? colors.error : alpha(textColor, 0.2) },
          ]}
          value={name}
          onChangeText={setName}
          placeholder="Meu Watchtower"
          placeholderTextColor={alpha(textColor, 0.4)}
        />
        {errors.name && (
          <Text style={[styles.errorText, { color: colors.error }]}>{errors.name}</Text>
        )}
      </View>

      <View style={styles.formField}>
        <Text style={[styles.inputLabel, { color: textColor }]}>URL</Text>
        <TextInput
          style={[
            styles.input,
            { color: textColor, borderColor: errors.url ? colors.error : alpha(textColor, 0.2) },
          ]}
          value={url}
          onChangeText={setUrl}
          placeholder="https://watchtower.example.com:9911"
          placeholderTextColor={alpha(textColor, 0.4)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {errors.url && (
          <Text style={[styles.errorText, { color: colors.error }]}>{errors.url}</Text>
        )}
      </View>

      <View style={styles.formField}>
        <Text style={[styles.inputLabel, { color: textColor }]}>Pubkey</Text>
        <TextInput
          style={[
            styles.input,
            { color: textColor, borderColor: errors.pubkey ? colors.error : alpha(textColor, 0.2) },
          ]}
          value={pubkey}
          onChangeText={setPubkey}
          placeholder="02abc..."
          placeholderTextColor={alpha(textColor, 0.4)}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {errors.pubkey && (
          <Text style={[styles.errorText, { color: colors.error }]}>{errors.pubkey}</Text>
        )}
      </View>

      <View style={styles.formActions}>
        <Pressable
          style={[styles.cancelButton, { borderColor: alpha(textColor, 0.2) }]}
          onPress={onCancel}
        >
          <Text style={[styles.cancelButtonText, { color: textColor }]}>Cancelar</Text>
        </Pressable>
        <Pressable
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={handleSubmit}
        >
          <Text style={styles.addButtonText}>Adicionar</Text>
        </Pressable>
      </View>
    </View>
  )
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function WatchtowerManagementScreen() {
  const router = useRouter()
  const colorMode = useActiveColorMode()
  const { state, start, stop } = useWatchtower()

  // Local state for remote watchtowers (TODO: persist)
  const [remoteWatchtowers, setRemoteWatchtowers] = useState<RemoteWatchtower[]>([])
  const [showAddForm, setShowAddForm] = useState(false)

  // Colors
  const textColor = colors.text[colorMode]
  const secondaryColor = alpha(textColor, 0.6)
  const bgColor = colors.background[colorMode]

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleToggleLocal = useCallback(() => {
    if (state.isRunning) {
      stop()
    } else {
      start()
    }
  }, [state.isRunning, start, stop])

  const handleAddRemote = useCallback((name: string, url: string, pubkey: string) => {
    const newWatchtower: RemoteWatchtower = {
      id: `wt_${Date.now()}`,
      name,
      url,
      pubkey,
      isConnected: false,
      channelsMonitored: 0,
    }

    setRemoteWatchtowers(prev => [...prev, newWatchtower])
    setShowAddForm(false)

    // TODO: Connect to remote watchtower via LightningService
    Alert.alert('Watchtower Adicionado', `${name} foi adicionado. Conectando...`)
  }, [])

  const handleRemoveRemote = useCallback((id: string) => {
    Alert.alert('Remover Watchtower', 'Deseja remover este watchtower remoto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          setRemoteWatchtowers(prev => prev.filter(wt => wt.id !== id))
        },
      },
    ])
  }, [])

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: bgColor }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={textColor} />
        </Pressable>
        <Text style={[styles.title, { color: textColor }]}>Watchtowers</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Local Watchtower Status */}
        <StatusCard
          colorMode={colorMode}
          isRunning={state.isRunning}
          monitoredChannels={state.status.monitoredChannels}
          breachesDetected={state.status.breachesDetected}
          lastCheck={state.status.lastCheck}
          onToggle={handleToggleLocal}
        />

        {/* Breach Alerts */}
        {state.hasBreaches && state.lastBreachEvent && (
          <View style={[styles.alertCard, { backgroundColor: alpha(colors.error, 0.1) }]}>
            <IconSymbol name="exclamationmark.triangle.fill" size={24} color={colors.error} />
            <View style={styles.alertContent}>
              <Text style={[styles.alertTitle, { color: colors.error }]}>Breach Detectado!</Text>
              <Text style={[styles.alertMessage, { color: textColor }]}>
                Canal: {state.lastBreachEvent.channelId?.substring(0, 16)}...
              </Text>
              <Text style={[styles.alertTime, { color: secondaryColor }]}>
                {formatTimestamp(state.lastBreachEvent.timestamp)}
              </Text>
            </View>
          </View>
        )}

        {/* Remote Watchtowers Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Watchtowers Remotos</Text>
          {!showAddForm && (
            <Pressable style={styles.addIconButton} onPress={() => setShowAddForm(true)}>
              <IconSymbol name="plus.circle.fill" size={28} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {/* Add Form */}
        {showAddForm && (
          <AddWatchtowerForm
            colorMode={colorMode}
            onAdd={handleAddRemote}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Remote Watchtower List */}
        {remoteWatchtowers.length > 0 ? (
          remoteWatchtowers.map(wt => (
            <RemoteWatchtowerCard
              key={wt.id}
              watchtower={wt}
              colorMode={colorMode}
              onRemove={handleRemoveRemote}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <IconSymbol name="antenna.radiowaves.left.and.right" size={48} color={secondaryColor} />
            <Text style={[styles.emptyTitle, { color: secondaryColor }]}>
              Nenhum Watchtower Remoto
            </Text>
            <Text style={[styles.emptySubtitle, { color: secondaryColor }]}>
              Adicione watchtowers externos para proteger seus canais mesmo quando offline.
            </Text>
          </View>
        )}

        {/* Info Box */}
        <View style={[styles.infoBox, { backgroundColor: alpha(colors.info, 0.1) }]}>
          <IconSymbol name="info.circle.fill" size={20} color={colors.info} />
          <Text style={[styles.infoText, { color: textColor }]}>
            Watchtowers monitoram a blockchain por tentativas de roubo (breaches) em seus canais
            Lightning. Se detectado, uma transação de penalidade é transmitida automaticamente.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  } as ViewStyle,
  backButton: {
    padding: 8,
  } as ViewStyle,
  title: {
    fontSize: 18,
    fontWeight: '600',
  } as TextStyle,
  headerSpacer: {
    width: 40,
  } as ViewStyle,
  scrollView: {
    flex: 1,
  } as ViewStyle,
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  } as ViewStyle,
  card: {
    borderRadius: 12,
    padding: 16,
  } as ViewStyle,
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  } as ViewStyle,
  statusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  } as ViewStyle,
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  statusToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  } as ViewStyle,
  statusToggleText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  } as TextStyle,
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  } as ViewStyle,
  statItem: {
    alignItems: 'center',
  } as ViewStyle,
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  } as TextStyle,
  statLabel: {
    fontSize: 12,
  } as TextStyle,
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error,
  } as ViewStyle,
  alertContent: {
    flex: 1,
  } as ViewStyle,
  alertTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  } as TextStyle,
  alertMessage: {
    fontSize: 14,
    marginBottom: 4,
  } as TextStyle,
  alertTime: {
    fontSize: 12,
  } as TextStyle,
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  } as ViewStyle,
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  addIconButton: {
    padding: 4,
  } as ViewStyle,
  remoteCard: {
    borderRadius: 12,
    padding: 16,
  } as ViewStyle,
  remoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  } as ViewStyle,
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  } as ViewStyle,
  remoteInfo: {
    flex: 1,
  } as ViewStyle,
  remoteName: {
    fontSize: 15,
    fontWeight: '600',
  } as TextStyle,
  remoteUrl: {
    fontSize: 12,
    marginTop: 2,
  } as TextStyle,
  removeButton: {
    padding: 4,
  } as ViewStyle,
  remoteStats: {
    flexDirection: 'row',
    gap: 16,
  } as ViewStyle,
  remoteStat: {
    flex: 1,
  } as ViewStyle,
  remoteStatLabel: {
    fontSize: 11,
    marginBottom: 2,
  } as TextStyle,
  remoteStatValue: {
    fontSize: 12,
    fontWeight: '500',
  } as TextStyle,
  formField: {
    marginBottom: 16,
  } as ViewStyle,
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  } as TextStyle,
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  } as TextStyle,
  errorText: {
    fontSize: 12,
    marginTop: 4,
  } as TextStyle,
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  } as ViewStyle,
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  } as ViewStyle,
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
  } as TextStyle,
  addButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  } as ViewStyle,
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  } as TextStyle,
  emptyState: {
    alignItems: 'center',
    padding: 24,
    gap: 12,
  } as ViewStyle,
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  } as TextStyle,
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 8,
  } as ViewStyle,
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  } as TextStyle,
})
