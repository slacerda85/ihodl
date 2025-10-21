import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, Alert, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { useLightning, useWallet } from '../store'
import { LightningChannel, ChannelStatus } from '@/lib/lightning'
import { formatBalance } from '../wallet/utils'

interface ChannelItemProps {
  channel: LightningChannel
  onPress: (channel: LightningChannel) => void
}

const ChannelItem: React.FC<ChannelItemProps> = ({ channel, onPress }) => {
  const { unit } = useWallet()

  const getStatusColor = (status: ChannelStatus) => {
    switch (status) {
      case 'active':
        return '#4CAF50'
      case 'inactive':
        return '#FF9800'
      case 'closing':
      case 'pending_open':
        return '#2196F3'
      case 'closed':
        return '#F44336'
      default:
        return '#9E9E9E'
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
    <Pressable style={styles.channelItem} onPress={() => onPress(channel)}>
      <View style={styles.channelHeader}>
        <Text style={styles.channelId} numberOfLines={1}>
          {channel.channelId.substring(0, 16)}...
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(channel.status) }]}>
          <Text style={styles.statusText}>{getStatusText(channel.status)}</Text>
        </View>
      </View>

      <View style={styles.channelDetails}>
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Saldo Local:</Text>
          <Text style={styles.balanceValue}>
            {formatBalance(channel.localBalance, unit)} {unit}
          </Text>
        </View>

        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Saldo Remoto:</Text>
          <Text style={styles.balanceValue}>
            {formatBalance(channel.remoteBalance, unit)} {unit}
          </Text>
        </View>

        <View style={styles.capacityContainer}>
          <Text style={styles.capacityLabel}>Capacidade:</Text>
          <Text style={styles.capacityValue}>
            {formatBalance(channel.capacity, unit)} {unit}
          </Text>
        </View>
      </View>

      <View style={styles.channelFooter}>
        <Text style={styles.remotePubkey} numberOfLines={1}>
          Peer: {channel.remotePubkey.substring(0, 20)}...
        </Text>
        <Text style={styles.confirmations}>{channel.numConfirmations} confirmações</Text>
      </View>
    </Pressable>
  )
}

interface ChannelActionsModalProps {
  channel: LightningChannel | null
  visible: boolean
  onClose: () => void
  onCloseChannel: (channelId: string, force: boolean) => void
}

const ChannelActionsModal: React.FC<ChannelActionsModalProps> = ({
  channel,
  visible,
  onClose,
  onCloseChannel,
}) => {
  if (!visible || !channel) return null

  const handleCloseChannel = (force: boolean = false) => {
    Alert.alert(
      force ? 'Forçar Fechamento' : 'Fechar Canal',
      `Tem certeza que deseja ${force ? 'forçar o fechamento' : 'fechar'} este canal? ${
        force ? 'Isso pode resultar em perda de fundos.' : ''
      }`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: force ? 'Forçar Fechar' : 'Fechar',
          style: force ? 'destructive' : 'default',
          onPress: () => {
            onCloseChannel(channel.channelId, force)
            onClose()
          },
        },
      ],
    )
  }

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Ações do Canal</Text>

        <View style={styles.channelInfo}>
          <Text style={styles.infoLabel}>ID do Canal:</Text>
          <Text style={styles.infoValue} selectable>
            {channel.channelId}
          </Text>

          <Text style={styles.infoLabel}>Peer:</Text>
          <Text style={styles.infoValue} selectable>
            {channel.remotePubkey}
          </Text>

          <Text style={styles.infoLabel}>Status:</Text>
          <Text style={styles.infoValue}>{channel.status}</Text>
        </View>

        <View style={styles.actionsContainer}>
          {channel.status === 'active' && (
            <>
              <Pressable
                style={[styles.actionButton, styles.closeButton]}
                onPress={() => handleCloseChannel(false)}
              >
                <Text style={styles.actionButtonText}>Fechar Canal</Text>
              </Pressable>

              <Pressable
                style={[styles.actionButton, styles.forceCloseButton]}
                onPress={() => handleCloseChannel(true)}
              >
                <Text style={styles.actionButtonText}>Forçar Fechamento</Text>
              </Pressable>
            </>
          )}

          <Pressable style={[styles.actionButton, styles.cancelButton]} onPress={onClose}>
            <Text style={styles.actionButtonText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const LightningChannels: React.FC = () => {
  const router = useRouter()
  const { getLightningChannels, getLightningBalance, loadChannels, closeChannel } = useLightning()
  const { unit, activeWalletId } = useWallet()

  const [selectedChannel, setSelectedChannel] = useState<LightningChannel | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const channels = getLightningChannels(activeWalletId || '')

  const handleRefresh = async () => {
    setRefreshing(true)
    if (activeWalletId) {
      await loadChannels(activeWalletId)
    }
    setRefreshing(false)
  }

  const handleChannelPress = (channel: LightningChannel) => {
    setSelectedChannel(channel)
    setModalVisible(true)
  }

  const handleCloseChannel = async (channelId: string, force: boolean) => {
    try {
      await closeChannel(activeWalletId!, channelId, force)
      Alert.alert('Sucesso', `Canal ${force ? 'forçadamente ' : ''}fechado com sucesso!`)
      // Refresh channels list
      if (activeWalletId) {
        await loadChannels(activeWalletId)
      }
    } catch (error) {
      console.error('Error closing channel:', error)
      Alert.alert('Erro', 'Falha ao fechar canal Lightning')
    }
  }

  useEffect(() => {
    if (activeWalletId) {
      loadChannels(activeWalletId)
    }
  }, [activeWalletId]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalBalance = activeWalletId ? getLightningBalance(activeWalletId) : 0
  const activeChannels = channels.filter(c => c.active).length

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Canais Lightning</Text>
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {activeChannels} canais ativos • {formatBalance(totalBalance, unit)} {unit}
          </Text>
        </View>
      </View>

      <FlatList
        data={channels}
        keyExtractor={item => item.channelId}
        renderItem={({ item }) => <ChannelItem channel={item} onPress={handleChannelPress} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhum canal encontrado</Text>
            <Text style={styles.emptySubtext}>Abra seu primeiro canal Lightning para começar</Text>
          </View>
        }
        contentContainerStyle={channels.length === 0 ? styles.emptyList : undefined}
      />

      <ChannelActionsModal
        channel={selectedChannel}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCloseChannel={handleCloseChannel}
      />

      <Pressable style={styles.fab} onPress={() => router.push('/wallet/open-channel' as any)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 14,
    color: '#666',
  },
  channelItem: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
    color: '#666',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
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
    color: '#666',
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  capacityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  capacityLabel: {
    fontSize: 14,
    color: '#666',
  },
  capacityValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  channelFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  remotePubkey: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#999',
    flex: 1,
  },
  confirmations: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  emptyList: {
    flex: 1,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    margin: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  channelInfo: {
    marginBottom: 20,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  closeButton: {
    backgroundColor: '#FF9800',
  },
  forceCloseButton: {
    backgroundColor: '#F44336',
  },
  cancelButton: {
    backgroundColor: '#9E9E9E',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
})

export default LightningChannels
