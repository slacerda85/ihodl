import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Switch,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useLightningChannels, useLightning, useWallet, useSettings } from '@/features/storage'
import { LightningChannel, ChannelStatus } from '@/lib/lightning'
import { formatBalance } from '../wallet/utils'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'

interface ChannelItemProps {
  channel: LightningChannel
  onPress: (channel: LightningChannel) => void
  isDark: boolean
}

const ChannelItem: React.FC<ChannelItemProps> = ({ channel, onPress, isDark }) => {
  const { unit } = useWallet()

  const getStatusColor = (status: ChannelStatus) => {
    switch (status) {
      case 'active':
        return colors.success
      case 'inactive':
        return '#FF9800'
      case 'closing':
      case 'pending_open':
        return colors.primary
      case 'closed':
        return colors.error
      default:
        return colors.textSecondary.light
    }
  }

  const getStatusText = (status: ChannelStatus) => {
    switch (status) {
      case 'active':
        return 'Ativo'
      case 'inactive':
        return 'Inativo'
      case 'closing':
        return 'Fechando'
      case 'pending_open':
        return 'Abrindo'
      case 'closed':
        return 'Fechado'
      default:
        return 'Desconhecido'
    }
  }

  return (
    <Pressable
      style={[styles.channelItem, isDark && styles.channelItemDark]}
      onPress={() => onPress(channel)}
    >
      <View style={styles.channelHeader}>
        <Text style={[styles.channelId, isDark && styles.channelIdDark]} numberOfLines={1}>
          {channel.channelId.substring(0, 16)}...
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(channel.status) }]}>
          <Text style={styles.statusText}>{getStatusText(channel.status)}</Text>
        </View>
      </View>

      <View style={styles.channelDetails}>
        <View style={styles.balanceContainer}>
          <Text style={[styles.balanceLabel, isDark && styles.balanceLabelDark]}>Saldo Local:</Text>
          <Text style={[styles.balanceValue, isDark && styles.balanceValueDark]}>
            {formatBalance(channel.localBalance, unit)} {unit}
          </Text>
        </View>

        <View style={styles.balanceContainer}>
          <Text style={[styles.balanceLabel, isDark && styles.balanceLabelDark]}>
            Saldo Remoto:
          </Text>
          <Text style={[styles.balanceValue, isDark && styles.balanceValueDark]}>
            {formatBalance(channel.remoteBalance, unit)} {unit}
          </Text>
        </View>

        <View style={styles.capacityContainer}>
          <Text style={[styles.capacityLabel, isDark && styles.capacityLabelDark]}>
            Capacidade:
          </Text>
          <Text style={[styles.capacityValue, isDark && styles.capacityValueDark]}>
            {formatBalance(channel.capacity, unit)} {unit}
          </Text>
        </View>
      </View>

      <View style={styles.channelFooter}>
        <Text style={[styles.remotePubkey, isDark && styles.remotePubkeyDark]} numberOfLines={1}>
          Peer: {channel.remotePubkey.substring(0, 20)}...
        </Text>
        <Text style={[styles.confirmations, isDark && styles.confirmationsDark]}>
          {channel.numConfirmations} confirmações
        </Text>
      </View>
    </Pressable>
  )
}

export default function LightningChannelsScreen() {
  const router = useRouter()
  const { channels } = useLightningChannels()
  const { spvEnabled, setSpvEnabled } = useLightning()
  const { isDark } = useSettings()

  const [refreshing, setRefreshing] = useState(false)
  const [lightningEnabled, setLightningEnabled] = useState(spvEnabled)
  const [isInitializing, setIsInitializing] = useState(false)

  const handleRefresh = async () => {
    if (!spvEnabled) return

    setRefreshing(true)
    // In SPV mode, we don't need to load channels from external sources
    // Channels are managed locally
    await new Promise(resolve => setTimeout(resolve, 500)) // Simulate refresh
    setRefreshing(false)
  }

  const handleChannelPress = (channel: LightningChannel) => {
    router.push(`/wallet/channel-actions?channelId=${channel.channelId}` as any)
  }

  const handleToggleLightning = async (enabled: boolean) => {
    if (enabled && !spvEnabled) {
      setIsInitializing(true)
      try {
        // Enable SPV mode
        setSpvEnabled(true)
        setLightningEnabled(true)
        Alert.alert('Sucesso', 'Lightning SPV ativado com sucesso!')
      } catch (error) {
        console.error('Erro ao ativar Lightning:', error)
        Alert.alert('Erro', 'Falha ao ativar Lightning SPV')
      } finally {
        setIsInitializing(false)
      }
    } else if (!enabled) {
      setSpvEnabled(false)
      setLightningEnabled(false)
      Alert.alert('Lightning desativado', 'Os canais permanecerão disponíveis para consulta')
    }
  }

  useEffect(() => {
    console.log(
      '[LightningChannelsScreen] Component mounted or SPV config changed, checking channels...',
    )
    // In SPV mode, channels are managed locally, no need to load from external sources
    if (spvEnabled) {
      // Could potentially sync with Electrum here in the future
      console.log('SPV enabled, channels available for viewing')
    }
  }, [spvEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <FlatList
        data={channels}
        keyExtractor={item => item.channelId}
        renderItem={({ item }) => (
          <ChannelItem channel={item} onPress={handleChannelPress} isDark={isDark} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={isDark ? colors.text.dark : colors.text.light}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
              Lightning Network
            </Text>
            <Text style={[styles.emptySubtext, isDark && styles.emptySubtextDark]}>
              Ative o Lightning SPV para visualizar seus canais existentes
            </Text>

            <View style={styles.toggleContainer}>
              <Text style={[styles.toggleLabel, isDark && styles.toggleLabelDark]}>
                Ativar Lightning SPV
              </Text>
              <Switch
                value={lightningEnabled}
                onValueChange={handleToggleLightning}
                disabled={isInitializing}
                trackColor={{ false: colors.textSecondary.light, true: colors.success }}
                thumbColor={lightningEnabled ? colors.white : colors.white}
              />
            </View>

            {isInitializing && (
              <Text style={[styles.initializingText, isDark && styles.initializingTextDark]}>
                Inicializando Lightning SPV...
              </Text>
            )}

            {lightningEnabled && !isInitializing && (
              <Text style={[styles.enabledText, isDark && styles.enabledTextDark]}>
                ✅ Lightning SPV ativo - Você pode visualizar seus canais
              </Text>
            )}
          </View>
        }
        contentContainerStyle={
          channels.length === 0 ? styles.emptyList : [styles.listContent, styles.containerPadding]
        }
        showsVerticalScrollIndicator={false}
      />
    </>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text.light,
    marginBottom: 8,
  },
  titleDark: {
    color: colors.text.dark,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  summaryTextDark: {
    color: colors.textSecondary.dark,
  },
  receiveButton: {
    backgroundColor: alpha(colors.success, 0.1),
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveButtonDark: {
    backgroundColor: alpha(colors.success, 0.1),
  },
  receiveButtonText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: 'bold',
  },
  listContent: {
    paddingBottom: 80, // Space for FAB
  },
  containerPadding: {
    paddingHorizontal: 16,
  },
  channelItem: {
    backgroundColor: colors.white,
    marginVertical: 8,
    borderRadius: 36,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  channelItemDark: {
    backgroundColor: 'linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(0,0,0,0.05))',
    borderWidth: 1,
    borderTopColor: alpha(colors.white, 0.1),
    borderBottomColor: alpha(colors.white, 0.05),
    borderLeftColor: alpha(colors.white, 0.075),
    borderRightColor: alpha(colors.white, 0.05),
    shadowColor: colors.white,
    shadowOpacity: 0.1,
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  channelId: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: colors.textSecondary.light,
    flex: 1,
  },
  channelIdDark: {
    color: colors.textSecondary.dark,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  channelDetails: {
    marginBottom: 12,
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
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
  capacityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.textSecondary.light,
  },
  capacityLabel: {
    fontSize: 14,
    color: colors.textSecondary.light,
  },
  capacityLabelDark: {
    color: colors.textSecondary.dark,
  },
  capacityValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
  },
  capacityValueDark: {
    color: colors.primary,
  },
  channelFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  remotePubkey: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.textSecondary.light,
    flex: 1,
  },
  remotePubkeyDark: {
    color: colors.textSecondary.dark,
  },
  confirmations: {
    fontSize: 12,
    color: colors.textSecondary.light,
  },
  confirmationsDark: {
    color: colors.textSecondary.dark,
  },
  emptyContainer: {
    // flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textSecondary.light,
    marginBottom: 8,
  },
  emptyTextDark: {
    color: colors.textSecondary.dark,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary.light,
    textAlign: 'center',
  },
  emptySubtextDark: {
    color: colors.textSecondary.dark,
  },
  emptyList: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fabDark: {
    shadowColor: colors.white,
  },
  fabText: {
    color: colors.white,
    fontSize: 24,
    fontWeight: 'bold',
  },
  openChannelButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 32,
    marginTop: 16,
  },
  openChannelButtonDark: {
    backgroundColor: colors.primary,
  },
  openChannelButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    marginTop: 16,
    width: '100%',
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.light,
  },
  toggleLabelDark: {
    color: colors.text.dark,
  },
  initializingText: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 12,
    textAlign: 'center',
  },
  initializingTextDark: {
    color: colors.primary,
  },
  enabledText: {
    fontSize: 14,
    color: colors.success,
    marginTop: 12,
    textAlign: 'center',
  },
  enabledTextDark: {
    color: colors.success,
  },
})
