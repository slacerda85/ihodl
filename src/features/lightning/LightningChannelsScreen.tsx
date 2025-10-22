import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { useLightningChannels, useWallet, useSettings } from '../store'
import { LightningChannel, ChannelStatus, LightningInvoice } from '@/lib/lightning'
import { formatBalance } from '../wallet/utils'
import colors from '@/ui/colors'
import { alpha } from '@/ui/utils'
import OpenChannelModal from './OpenChannelModal'
import CreateInvoiceModal from './CreateInvoiceModal'
import InvoiceDisplayModal from './InvoiceDisplayModal'

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
  const {
    channels,
    totalBalance,
    activeChannelsCount,
    loadChannelsAsync,
    openChannelAsync,
    createInvoiceAsync,
    isWalletConfigured,
  } = useLightningChannels()
  const { unit } = useWallet()
  const { isDark } = useSettings()

  const [refreshing, setRefreshing] = useState(false)
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false)
  const [showInvoiceDisplayModal, setShowInvoiceDisplayModal] = useState(false)
  const [currentInvoice, setCurrentInvoice] = useState<LightningInvoice | null>(null)

  const handleRefresh = async () => {
    if (!isWalletConfigured) return

    setRefreshing(true)
    await loadChannelsAsync()
    setRefreshing(false)
  }

  const handleChannelPress = (channel: LightningChannel) => {
    router.push(`/wallet/channel-actions?channelId=${channel.channelId}` as any)
  }

  const handleCreateInvoice = async (params: {
    amount: number
    description: string
    expiry?: number
  }) => {
    try {
      const invoice = await createInvoiceAsync(params)
      setCurrentInvoice(invoice)
      setShowInvoiceDisplayModal(true)
      setShowCreateInvoiceModal(false)
    } catch (error) {
      console.error('Error creating invoice:', error)
      // Error handling is done in the hook
    }
  }

  const handleOpenChannel = async (params: {
    nodePubkey: string
    localFundingAmount: number
    pushSat?: number
    targetConf?: number
    minHtlcMsat?: number
    remoteCsvDelay?: number
    minConfs?: number
    private?: boolean
  }) => {
    try {
      await openChannelAsync(params)
      setShowOpenModal(false)
    } catch (error) {
      console.error('Error opening channel:', error)
      // Error handling is done in the hook
    }
  }

  useEffect(() => {
    console.log(
      '[LightningChannelsScreen] Component mounted or wallet config changed, loading channels...',
    )
    if (isWalletConfigured) {
      loadChannelsAsync()
    }
  }, [isWalletConfigured]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debug: log when channels change
  /* useEffect(() => {
    console.log('[LightningChannelsScreen] Channels updated:', channels.length, 'channels')
  }, [channels]) */

  return (
    <>
      <FlatList
        data={channels}
        keyExtractor={item => item.channelId}
        /* ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, isDark && styles.titleDark]}>Canais Lightning</Text>
            <View style={styles.summary}>
              <Text style={[styles.summaryText, isDark && styles.summaryTextDark]}>
                {activeChannelsCount} canais ativos • {formatBalance(totalBalance, unit)} {unit}
              </Text>
              {isWalletConfigured && (
                <Pressable
                  style={[styles.receiveButton, isDark && styles.receiveButtonDark]}
                  onPress={() => setShowCreateInvoiceModal(true)}
                >
                  <Text style={styles.receiveButtonText}>Receber</Text>
                </Pressable>
              )}
            </View>
          </View>
        } */
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
              Nenhum canal encontrado
            </Text>
            <Text style={[styles.emptySubtext, isDark && styles.emptySubtextDark]}>
              Configure sua conexão com um nó Lightning para começar
            </Text>
            <Pressable
              style={[styles.openChannelButton, isDark && styles.openChannelButtonDark]}
              onPress={() => router.push('/wallet/lightning-config' as any)}
            >
              <Text style={styles.openChannelButtonText}>Configurar Lightning</Text>
            </Pressable>
          </View>
        }
        contentContainerStyle={
          channels.length === 0 ? styles.emptyList : [styles.listContent, styles.containerPadding]
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Button - Only show if wallet is configured */}
      {isWalletConfigured && (
        <Pressable
          style={[styles.fab, isDark && styles.fabDark]}
          onPress={() => setShowOpenModal(true)}
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}

      {/* Open Channel Modal */}
      <OpenChannelModal
        visible={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        onOpenChannel={handleOpenChannel}
      />

      {/* Create Invoice Modal */}
      <CreateInvoiceModal
        visible={showCreateInvoiceModal}
        onClose={() => setShowCreateInvoiceModal(false)}
        onCreateInvoice={handleCreateInvoice}
      />

      {/* Invoice Display Modal */}
      <InvoiceDisplayModal
        visible={showInvoiceDisplayModal}
        onClose={() => setShowInvoiceDisplayModal(false)}
        invoice={currentInvoice}
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
})
