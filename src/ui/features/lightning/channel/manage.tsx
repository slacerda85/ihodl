/**
 * Channel Management Screen
 *
 * Tela para gerenciamento de canais Lightning Network existentes.
 * Lista todos os canais, exibe métricas e permite ações como fechar canal.
 */

import React, { useState, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  type ViewStyle,
  type TextStyle,
} from 'react-native'
import { useRouter } from 'expo-router'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import { IconSymbol } from '@/ui/components/IconSymbol/IconSymbol'
import { useLightningChannels } from '../hooks'
import { useLightningActions } from '../hooks'
import { useActiveColorMode } from '@/ui/features/app-provider'
import { useAutoChannelOpening } from '../hooks/useAutoChannel'
import { useInboundBalance } from '../hooks/useInboundBalance'
import type { Channel, ChannelStateType, Satoshis } from '../types'

// ==========================================
// TYPES
// ==========================================

type ColorMode = 'light' | 'dark'

interface ChannelCardProps {
  channel: Channel
  colorMode: ColorMode
  onClose: (channelId: string) => void
  onForceClose: (channelId: string) => void
}

// ==========================================
// HELPERS
// ==========================================

function formatSatoshis(sats: Satoshis): string {
  const num = Number(sats)
  if (num >= 100000000) {
    return `${(num / 100000000).toFixed(4)} BTC`
  } else if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)} M sats`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)} K sats`
  }
  return `${num} sats`
}

function getStateColor(state: ChannelStateType): string {
  switch (state) {
    case 'open':
      return colors.success
    case 'opening':
      return colors.warning
    case 'closing':
      return colors.warning
    case 'closed':
      return colors.error
    default:
      return colors.placeholder
  }
}

function getStateLabel(state: ChannelStateType): string {
  switch (state) {
    case 'open':
      return 'Ativo'
    case 'opening':
      return 'Abrindo'
    case 'closing':
      return 'Fechando'
    case 'closed':
      return 'Fechado'
    default:
      return 'Desconhecido'
  }
}

function truncatePeerId(peerId: string): string {
  if (peerId.length <= 20) return peerId
  return `${peerId.slice(0, 8)}...${peerId.slice(-8)}`
}

// ==========================================
// CHANNEL CARD COMPONENT
// ==========================================

function ChannelCard({ channel, colorMode, onClose, onForceClose }: ChannelCardProps) {
  const totalCapacity = Number(channel.capacitySat)
  const localBalance = Number(channel.localBalanceSat)
  const localPercent = totalCapacity > 0 ? (localBalance / totalCapacity) * 100 : 0

  const cardStyle: ViewStyle = {
    backgroundColor: colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: alpha(colors.text[colorMode], 0.1),
  }

  const textColor = colors.text[colorMode]
  const secondaryColor = alpha(textColor, 0.6)

  return (
    <View style={cardStyle}>
      {/* Header */}
      <View style={cardStyles.header}>
        <View style={cardStyles.statusContainer}>
          <View style={[cardStyles.statusDot, { backgroundColor: getStateColor(channel.state) }]} />
          <Text style={[cardStyles.statusText, { color: getStateColor(channel.state) }]}>
            {getStateLabel(channel.state)}
          </Text>
        </View>
        {channel.isActive && (
          <View style={cardStyles.activeBadge}>
            <Text style={cardStyles.activeBadgeText}>Online</Text>
          </View>
        )}
      </View>

      {/* Peer ID */}
      <Text style={[cardStyles.peerId, { color: secondaryColor }]}>
        {truncatePeerId(channel.peerId)}
      </Text>

      {/* Balance Bar */}
      <View style={cardStyles.balanceSection}>
        <View style={cardStyles.balanceLabels}>
          <Text style={[cardStyles.balanceLabel, { color: textColor }]}>Local</Text>
          <Text style={[cardStyles.balanceLabel, { color: textColor }]}>Remoto</Text>
        </View>
        <View style={cardStyles.balanceBar}>
          <View style={[cardStyles.localBalance, { width: `${localPercent}%` }]} />
        </View>
        <View style={cardStyles.balanceValues}>
          <Text style={[cardStyles.balanceValue, { color: secondaryColor }]}>
            {formatSatoshis(channel.localBalanceSat)}
          </Text>
          <Text style={[cardStyles.balanceValue, { color: secondaryColor }]}>
            {formatSatoshis(channel.remoteBalanceSat)}
          </Text>
        </View>
      </View>

      {/* Capacity */}
      <View style={cardStyles.capacityRow}>
        <Text style={[cardStyles.capacityLabel, { color: secondaryColor }]}>Capacidade Total:</Text>
        <Text style={[cardStyles.capacityValue, { color: textColor }]}>
          {formatSatoshis(channel.capacitySat)}
        </Text>
      </View>

      {/* Actions */}
      {channel.state === 'open' && (
        <View style={cardStyles.actions}>
          <TouchableOpacity
            style={[cardStyles.actionButton, cardStyles.closeButton]}
            onPress={() => onClose(channel.channelId)}
          >
            <Text style={cardStyles.actionButtonText}>Fechar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[cardStyles.actionButton, cardStyles.forceCloseButton]}
            onPress={() => onForceClose(channel.channelId)}
          >
            <Text style={cardStyles.forceCloseText}>Force Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function ChannelManageScreen() {
  const router = useRouter()
  const colorMode = useActiveColorMode()
  const channels = useLightningChannels()
  const { getChannels, closeChannel, forceCloseChannel } = useLightningActions()
  const { openChannelManually } = useAutoChannelOpening()
  const inboundBalance = useInboundBalance()

  const [isRefreshing, setIsRefreshing] = useState(false)

  // Stats
  const totalCapacity = channels.reduce((acc, ch) => acc + Number(ch.capacitySat), 0)
  const totalLocal = channels.reduce((acc, ch) => acc + Number(ch.localBalanceSat), 0)
  const activeChannels = channels.filter(ch => ch.state === 'open' && ch.isActive).length

  // Avoid unused variable warnings - these are used in stats display
  void totalCapacity

  // ==========================================
  // ACTIONS
  // ==========================================

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await getChannels()
    } finally {
      setIsRefreshing(false)
    }
  }, [getChannels])

  const handleCloseChannel = useCallback(
    (channelId: string) => {
      Alert.alert('Fechar Canal', 'Tem certeza que deseja fechar este canal cooperativamente?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Fechar',
          onPress: async () => {
            try {
              await closeChannel(channelId)
              Alert.alert('Sucesso', 'Fechamento cooperativo iniciado.')
            } catch {
              Alert.alert('Erro', 'Falha ao fechar canal. Tente novamente.')
            }
          },
        },
      ])
    },
    [closeChannel],
  )

  const handleForceCloseChannel = useCallback(
    (channelId: string) => {
      Alert.alert(
        '⚠️ Force Close',
        'Force close é uma operação de emergência. Seus fundos ficarão bloqueados por um período. Tem certeza?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Force Close',
            style: 'destructive',
            onPress: async () => {
              try {
                await forceCloseChannel(channelId)
                Alert.alert(
                  'Sucesso',
                  'Force close iniciado. Seus fundos estarão disponíveis após o período de timelock.',
                )
              } catch {
                Alert.alert('Erro', 'Falha ao forçar fechamento. Tente novamente.')
              }
            },
          },
        ],
      )
    },
    [forceCloseChannel],
  )

  const handleNavigateToCreate = useCallback(() => {
    router.push('/lightning/channel/create' as any)
  }, [router])

  const handleOpenChannelWithOnChain = useCallback(async () => {
    const pendingBalance = inboundBalance.pendingOnChainBalance

    if (pendingBalance <= 0n) {
      Alert.alert('Sem fundos', 'Não há saldo on-chain pendente para abrir canal.')
      return
    }

    Alert.alert(
      'Abrir Canal com Fundos On-Chain',
      `Deseja abrir um canal usando ${formatSatoshis(pendingBalance)} de fundos on-chain?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abrir Canal',
          onPress: async () => {
            try {
              const success = await openChannelManually(pendingBalance)
              if (success) {
                Alert.alert('Sucesso', 'Canal aberto com sucesso!')
              } else {
                Alert.alert('Erro', 'Falha ao abrir canal. Tente novamente.')
              }
            } catch (error) {
              Alert.alert('Erro', 'Erro inesperado ao abrir canal.')
            }
          },
        },
      ],
    )
  }, [inboundBalance.pendingOnChainBalance, openChannelManually])

  // ==========================================
  // RENDER
  // ==========================================

  const textColor = colors.text[colorMode]
  const secondaryColor = alpha(textColor, 0.6)
  const bgColor = colors.background[colorMode]

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: textColor }]}>Canais</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={handleOpenChannelWithOnChain}
            style={styles.onChainButton}
            disabled={inboundBalance.pendingOnChainBalance <= 0n}
          >
            <IconSymbol
              name="arrow.down.circle"
              size={20}
              color={
                inboundBalance.pendingOnChainBalance > 0n
                  ? colors.primary
                  : colors.textSecondary[colorMode]
              }
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNavigateToCreate} style={styles.addButton}>
            <IconSymbol name="plus" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Summary */}
      <View
        style={[
          styles.statsContainer,
          { backgroundColor: colorMode === 'dark' ? alpha(colors.white, 0.05) : colors.white },
        ]}
      >
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: textColor }]}>{channels.length}</Text>
          <Text style={[styles.statLabel, { color: secondaryColor }]}>Total</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.success }]}>{activeChannels}</Text>
          <Text style={[styles.statLabel, { color: secondaryColor }]}>Ativos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: textColor }]}>
            {formatSatoshis(BigInt(totalLocal))}
          </Text>
          <Text style={[styles.statLabel, { color: secondaryColor }]}>Saldo Local</Text>
        </View>
      </View>

      {/* Channel List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        {channels.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyIcon]}>⚡</Text>
            <Text style={[styles.emptyTitle, { color: textColor }]}>Nenhum canal</Text>
            <Text style={[styles.emptyDescription, { color: secondaryColor }]}>
              Abra um canal para começar a usar a Lightning Network
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={handleNavigateToCreate}>
              <Text style={styles.emptyButtonText}>Abrir Canal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          channels.map(channel => (
            <ChannelCard
              key={channel.channelId}
              channel={channel}
              colorMode={colorMode}
              onClose={handleCloseChannel}
              onForceClose={handleForceCloseChannel}
            />
          ))
        )}
      </ScrollView>
    </View>
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
  } as ViewStyle,
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  backButton: {
    padding: 8,
  } as ViewStyle,
  title: {
    fontSize: 20,
    fontWeight: '600',
  } as TextStyle,
  addButton: {
    padding: 8,
  } as ViewStyle,
  onChainButton: {
    padding: 8,
  } as ViewStyle,
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
  } as ViewStyle,
  statItem: {
    flex: 1,
    alignItems: 'center',
  } as ViewStyle,
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  } as TextStyle,
  statLabel: {
    fontSize: 12,
  } as TextStyle,
  statDivider: {
    width: 1,
    backgroundColor: alpha(colors.placeholder, 0.3),
    marginHorizontal: 12,
  } as ViewStyle,
  list: {
    flex: 1,
  } as ViewStyle,
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  } as ViewStyle,
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  } as ViewStyle,
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  } as TextStyle,
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  } as TextStyle,
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  } as TextStyle,
  emptyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  } as ViewStyle,
  emptyButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
})

const cardStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  } as ViewStyle,
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  } as ViewStyle,
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  } as ViewStyle,
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  } as TextStyle,
  activeBadge: {
    backgroundColor: alpha(colors.success, 0.15),
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  } as ViewStyle,
  activeBadgeText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '500',
  } as TextStyle,
  peerId: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 16,
  } as TextStyle,
  balanceSection: {
    marginBottom: 12,
  } as ViewStyle,
  balanceLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  } as ViewStyle,
  balanceLabel: {
    fontSize: 12,
    fontWeight: '500',
  } as TextStyle,
  balanceBar: {
    height: 8,
    backgroundColor: alpha(colors.placeholder, 0.2),
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  } as ViewStyle,
  localBalance: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  } as ViewStyle,
  balanceValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  } as ViewStyle,
  balanceValue: {
    fontSize: 12,
  } as TextStyle,
  capacityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  } as ViewStyle,
  capacityLabel: {
    fontSize: 14,
  } as TextStyle,
  capacityValue: {
    fontSize: 14,
    fontWeight: '600',
  } as TextStyle,
  actions: {
    flexDirection: 'row',
    gap: 12,
  } as ViewStyle,
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  } as ViewStyle,
  closeButton: {
    backgroundColor: alpha(colors.primary, 0.15),
  } as ViewStyle,
  actionButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  } as TextStyle,
  forceCloseButton: {
    backgroundColor: alpha(colors.error, 0.15),
  } as ViewStyle,
  forceCloseText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  } as TextStyle,
})
