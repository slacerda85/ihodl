import {
  lightningReducer,
  initialLightningState,
  lightningActions,
  lightningSelectors,
  LightningState,
} from '../lightning'
import {
  LightningChannel,
  ChannelStatus,
  ChannelType,
  CommitmentType,
  ChannelLifecycleState,
} from '@/lib/lightning'

describe('Lightning Store - SPV', () => {
  describe('lightningReducer', () => {
    it('should return initial state', () => {
      const result = lightningReducer(initialLightningState, { type: 'UNKNOWN' } as any)
      expect(result).toEqual(initialLightningState)
    })

    it('should set SPV enabled', () => {
      const action = lightningActions.setSpvEnabled(true)
      const result = lightningReducer(initialLightningState, action)

      expect(result.spvEnabled).toBe(true)
    })

    it('should add channel', () => {
      const mockChannel: LightningChannel = {
        channelId: 'test-channel',
        channelPoint: 'txid:0',
        localBalance: 100000,
        remoteBalance: 50000,
        capacity: 150000,
        remotePubkey: 'remote-pubkey',
        status: 'active' as ChannelStatus,
        channelType: 'static_remote_key' as ChannelType,
        numConfirmations: 6,
        commitmentType: 'static_remote_key' as CommitmentType,
        private: false,
        initiator: true,
        feePerKw: 253,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: true,
        lifecycleState: 'active' as ChannelLifecycleState,
      }

      const action = lightningActions.addChannel(mockChannel)
      const result = lightningReducer(initialLightningState, action)

      expect(result.channels).toHaveLength(1)
      expect(result.channels[0]).toEqual(mockChannel)
    })

    it('should update channel', () => {
      const mockChannel: LightningChannel = {
        channelId: 'test-channel',
        channelPoint: 'txid:0',
        localBalance: 100000,
        remoteBalance: 50000,
        capacity: 150000,
        remotePubkey: 'remote-pubkey',
        status: 'active' as ChannelStatus,
        channelType: 'static_remote_key' as ChannelType,
        numConfirmations: 6,
        commitmentType: 'static_remote_key' as CommitmentType,
        private: false,
        initiator: true,
        feePerKw: 253,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: true,
        lifecycleState: 'active' as ChannelLifecycleState,
      }

      const stateWithChannel = lightningReducer(
        initialLightningState,
        lightningActions.addChannel(mockChannel),
      )

      const updateAction = lightningActions.updateChannel('test-channel', {
        localBalance: 80000,
        status: 'inactive' as ChannelStatus,
      })
      const result = lightningReducer(stateWithChannel, updateAction)

      const updatedChannel = result.channels[0]
      expect(updatedChannel.localBalance).toBe(80000)
      expect(updatedChannel.status).toBe('inactive')
    })

    it('should remove channel', () => {
      const mockChannel: LightningChannel = {
        channelId: 'test-channel',
        channelPoint: 'txid:0',
        localBalance: 100000,
        remoteBalance: 50000,
        capacity: 150000,
        remotePubkey: 'remote-pubkey',
        status: 'active' as ChannelStatus,
        channelType: 'static_remote_key' as ChannelType,
        numConfirmations: 6,
        commitmentType: 'static_remote_key' as CommitmentType,
        private: false,
        initiator: true,
        feePerKw: 253,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: true,
        lifecycleState: 'active' as ChannelLifecycleState,
      }

      const stateWithChannel = lightningReducer(
        initialLightningState,
        lightningActions.addChannel(mockChannel),
      )

      const removeAction = lightningActions.removeChannel('test-channel')
      const result = lightningReducer(stateWithChannel, removeAction)

      expect(result.channels).toHaveLength(0)
    })

    it('should set loading state', () => {
      const action = lightningActions.setLoadingLightning(true)
      const result = lightningReducer(initialLightningState, action)

      expect(result.loadingLightningState).toBe(true)
    })

    it('should clear channels', () => {
      const mockChannel: LightningChannel = {
        channelId: 'test-channel',
        channelPoint: 'txid:0',
        localBalance: 100000,
        remoteBalance: 50000,
        capacity: 150000,
        remotePubkey: 'remote-pubkey',
        status: 'active' as ChannelStatus,
        channelType: 'static_remote_key' as ChannelType,
        numConfirmations: 6,
        commitmentType: 'static_remote_key' as CommitmentType,
        private: false,
        initiator: true,
        feePerKw: 253,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: true,
        lifecycleState: 'active' as ChannelLifecycleState,
      }

      const stateWithChannel = lightningReducer(
        initialLightningState,
        lightningActions.addChannel(mockChannel),
      )

      const clearAction = lightningActions.clearChannels()
      const result = lightningReducer(stateWithChannel, clearAction)

      expect(result.channels).toHaveLength(0)
    })
  })

  describe('lightningSelectors', () => {
    const mockState: LightningState = {
      ...initialLightningState,
      spvEnabled: true,
      channels: [
        {
          channelId: 'active-channel',
          channelPoint: 'txid:0',
          localBalance: 100000,
          remoteBalance: 50000,
          capacity: 150000,
          remotePubkey: 'remote-pubkey',
          status: 'active' as ChannelStatus,
          channelType: 'static_remote_key' as ChannelType,
          numConfirmations: 6,
          commitmentType: 'static_remote_key' as CommitmentType,
          private: false,
          initiator: true,
          feePerKw: 253,
          unsettledBalance: 0,
          totalSatoshisSent: 0,
          totalSatoshisReceived: 0,
          numUpdates: 0,
          pendingHtlcs: [],
          csvDelay: 144,
          active: true,
          lifecycleState: 'active' as ChannelLifecycleState,
        },
        {
          channelId: 'inactive-channel',
          channelPoint: 'txid:1',
          localBalance: 50000,
          remoteBalance: 25000,
          capacity: 75000,
          remotePubkey: 'remote-pubkey-2',
          status: 'inactive' as ChannelStatus,
          channelType: 'static_remote_key' as ChannelType,
          numConfirmations: 6,
          commitmentType: 'static_remote_key' as CommitmentType,
          private: false,
          initiator: false,
          feePerKw: 253,
          unsettledBalance: 0,
          totalSatoshisSent: 0,
          totalSatoshisReceived: 0,
          numUpdates: 0,
          pendingHtlcs: [],
          csvDelay: 144,
          active: false,
          lifecycleState: 'active' as ChannelLifecycleState,
        },
      ],
    }

    it('should check if SPV is enabled', () => {
      const result = lightningSelectors.isSpvEnabled(mockState)
      expect(result).toBe(true)
    })

    it('should get channels', () => {
      const result = lightningSelectors.getChannels(mockState)
      expect(result).toHaveLength(2)
      expect(result[0].channelId).toBe('active-channel')
    })

    it('should get active channels', () => {
      const result = lightningSelectors.getActiveChannels(mockState)
      expect(result).toHaveLength(1)
      expect(result[0].channelId).toBe('active-channel')
    })

    it('should get channel by id', () => {
      const result = lightningSelectors.getChannelById(mockState, 'active-channel')
      expect(result?.channelId).toBe('active-channel')
    })

    it('should return null for non-existent channel', () => {
      const result = lightningSelectors.getChannelById(mockState, 'non-existent')
      expect(result).toBeNull()
    })

    it('should calculate lightning balance correctly', () => {
      const result = lightningSelectors.getLightningBalance(mockState)
      expect(result).toBe(100000) // Only active channel balance
    })

    it('should check loading state', () => {
      const result = lightningSelectors.isLoadingLightning(mockState)
      expect(result).toBe(false)
    })
  })

  describe('lightningActions', () => {
    it('should create setSpvEnabled action', () => {
      const action = lightningActions.setSpvEnabled(true)

      expect(action.type).toBe('SET_SPV_ENABLED')
      expect((action as any).payload).toBe(true)
    })

    it('should create addChannel action', () => {
      const mockChannel: LightningChannel = {
        channelId: 'test-channel',
        channelPoint: 'txid:0',
        localBalance: 100000,
        remoteBalance: 50000,
        capacity: 150000,
        remotePubkey: 'remote-pubkey',
        status: 'active' as ChannelStatus,
        channelType: 'static_remote_key' as ChannelType,
        numConfirmations: 6,
        commitmentType: 'static_remote_key' as CommitmentType,
        private: false,
        initiator: true,
        feePerKw: 253,
        unsettledBalance: 0,
        totalSatoshisSent: 0,
        totalSatoshisReceived: 0,
        numUpdates: 0,
        pendingHtlcs: [],
        csvDelay: 144,
        active: true,
        lifecycleState: 'active' as ChannelLifecycleState,
      }

      const action = lightningActions.addChannel(mockChannel)

      expect(action.type).toBe('ADD_CHANNEL')
      expect((action as any).payload).toEqual(mockChannel)
    })

    it('should create updateChannel action', () => {
      const updates = { localBalance: 80000 }
      const action = lightningActions.updateChannel('test-channel', updates)

      expect(action.type).toBe('UPDATE_CHANNEL')
      expect((action as any).payload.channelId).toBe('test-channel')
      expect((action as any).payload.updates).toEqual(updates)
    })

    it('should create removeChannel action', () => {
      const action = lightningActions.removeChannel('test-channel')

      expect(action.type).toBe('REMOVE_CHANNEL')
      expect((action as any).payload).toBe('test-channel')
    })

    it('should create setLoadingLightning action', () => {
      const action = lightningActions.setLoadingLightning(true)

      expect(action.type).toBe('SET_LOADING_LIGHTNING')
      expect((action as any).payload).toBe(true)
    })

    it('should create clearChannels action', () => {
      const action = lightningActions.clearChannels()

      expect(action.type).toBe('CLEAR_CHANNELS')
      expect(action).not.toHaveProperty('payload')
    })
  })
})
