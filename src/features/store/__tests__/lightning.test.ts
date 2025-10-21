import {
  lightningReducer,
  initialLightningState,
  lightningActions,
  lightningSelectors,
  LightningState,
} from '../lightning'
import {
  LightningWalletData,
  LightningConfig,
  LightningChannel,
  LightningPayment,
  LightningInvoice,
  ChannelStatus,
  ChannelType,
  CommitmentType,
  ChannelLifecycleState,
  PaymentStatus,
} from '@/lib/lightning'

describe('Lightning Store', () => {
  describe('lightningReducer', () => {
    it('should return initial state', () => {
      const result = lightningReducer(initialLightningState, { type: 'UNKNOWN' } as any)
      expect(result).toEqual(initialLightningState)
    })

    it('should set lightning wallet', () => {
      const mockWalletData: LightningWalletData = {
        nodePubkey: 'test-pubkey',
        channels: [],
        payments: [],
        invoices: [],
        config: {
          nodeUrl: 'localhost:9735',
          type: 'lnd',
          authMethod: 'tls',
          maxFeeLimit: 100000,
          defaultCltvExpiry: 144,
          timeoutSeconds: 30,
        },
      }

      const action = lightningActions.setLightningWallet('test-wallet', mockWalletData)
      const result = lightningReducer(initialLightningState, action)

      expect(result.lightningWallets['test-wallet']).toEqual(mockWalletData)
    })

    it('should update lightning wallet', () => {
      const initialWalletData: LightningWalletData = {
        nodePubkey: 'test-pubkey',
        channels: [],
        payments: [],
        invoices: [],
        config: {
          nodeUrl: 'localhost:9735',
          type: 'lnd',
          authMethod: 'tls',
          maxFeeLimit: 100000,
          defaultCltvExpiry: 144,
          timeoutSeconds: 30,
        },
      }

      const stateWithWallet = lightningReducer(
        initialLightningState,
        lightningActions.setLightningWallet('test-wallet', initialWalletData),
      )

      const updateAction = lightningActions.updateLightningWallet('test-wallet', {
        nodePubkey: 'updated-pubkey',
      })
      const result = lightningReducer(stateWithWallet, updateAction)

      expect(result.lightningWallets['test-wallet'].nodePubkey).toBe('updated-pubkey')
    })

    it('should delete lightning wallet', () => {
      const mockWalletData: LightningWalletData = {
        nodePubkey: 'test-pubkey',
        channels: [],
        payments: [],
        invoices: [],
        config: {
          nodeUrl: 'localhost:9735',
          type: 'lnd',
          authMethod: 'tls',
          maxFeeLimit: 100000,
          defaultCltvExpiry: 144,
          timeoutSeconds: 30,
        },
      }

      const stateWithWallet = lightningReducer(
        initialLightningState,
        lightningActions.setLightningWallet('test-wallet', mockWalletData),
      )

      const deleteAction = lightningActions.deleteLightningWallet('test-wallet')
      const result = lightningReducer(stateWithWallet, deleteAction)

      expect(result.lightningWallets['test-wallet']).toBeUndefined()
      expect(result.lightningConfigs['test-wallet']).toBeUndefined()
      expect(result.connectedNodes['test-wallet']).toBeUndefined()
    })

    it('should set lightning config', () => {
      const config: LightningConfig = {
        nodeUrl: 'localhost:9735',
        type: 'lnd',
        authMethod: 'tls',
        maxFeeLimit: 100000,
        defaultCltvExpiry: 144,
        timeoutSeconds: 30,
      }

      const action = lightningActions.setLightningConfig('test-wallet', config)
      const result = lightningReducer(initialLightningState, action)

      expect(result.lightningConfigs['test-wallet']).toEqual(config)
    })

    it('should set loading state', () => {
      const action = lightningActions.setLoadingLightning(true)
      const result = lightningReducer(initialLightningState, action)

      expect(result.loadingLightningState).toBe(true)
    })

    it('should set node connection', () => {
      const action = lightningActions.setNodeConnection('test-wallet', true)
      const result = lightningReducer(initialLightningState, action)

      expect(result.connectedNodes['test-wallet']).toBe(true)
    })

    it('should add lightning channel', () => {
      const mockChannel: LightningChannel = {
        channelId: 'test-channel',
        channelPoint: 'txid:0',
        localBalance: 100000,
        remoteBalance: 50000,
        capacity: 150000,
        remotePubkey: 'remote-pubkey',
        status: 'active',
        channelType: 'static_remote_key',
        numConfirmations: 6,
        commitmentType: 'static_remote_key',
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
        lifecycleState: 'active',
      }

      const stateWithWallet = lightningReducer(
        initialLightningState,
        lightningActions.setLightningWallet('test-wallet', {
          nodePubkey: 'test-pubkey',
          channels: [],
          payments: [],
          invoices: [],
          config: {
            nodeUrl: 'localhost:9735',
            type: 'lnd',
            authMethod: 'tls',
            maxFeeLimit: 100000,
            defaultCltvExpiry: 144,
            timeoutSeconds: 30,
          },
        }),
      )

      const addAction = lightningActions.addLightningChannel('test-wallet', mockChannel)
      const result = lightningReducer(stateWithWallet, addAction)

      expect(result.lightningWallets['test-wallet'].channels).toHaveLength(1)
      expect(result.lightningWallets['test-wallet'].channels[0]).toEqual(mockChannel)
    })

    it('should update lightning channel', () => {
      const mockChannel: LightningChannel = {
        channelId: 'test-channel',
        channelPoint: 'txid:0',
        localBalance: 100000,
        remoteBalance: 50000,
        capacity: 150000,
        remotePubkey: 'remote-pubkey',
        status: 'active',
        channelType: 'static_remote_key',
        numConfirmations: 6,
        commitmentType: 'static_remote_key',
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
        lifecycleState: 'active',
      }

      const stateWithWallet = lightningReducer(
        initialLightningState,
        lightningActions.setLightningWallet('test-wallet', {
          nodePubkey: 'test-pubkey',
          channels: [mockChannel],
          payments: [],
          invoices: [],
          config: {
            nodeUrl: 'localhost:9735',
            type: 'lnd',
            authMethod: 'tls',
            maxFeeLimit: 100000,
            defaultCltvExpiry: 144,
            timeoutSeconds: 30,
          },
        }),
      )

      const updateAction = lightningActions.updateLightningChannel('test-wallet', 'test-channel', {
        localBalance: 80000,
        status: 'inactive',
      })
      const result = lightningReducer(stateWithWallet, updateAction)

      const updatedChannel = result.lightningWallets['test-wallet'].channels[0]
      expect(updatedChannel.localBalance).toBe(80000)
      expect(updatedChannel.status).toBe('inactive')
    })

    it('should remove lightning channel', () => {
      const mockChannel: LightningChannel = {
        channelId: 'test-channel',
        channelPoint: 'txid:0',
        localBalance: 100000,
        remoteBalance: 50000,
        capacity: 150000,
        remotePubkey: 'remote-pubkey',
        status: 'active',
        channelType: 'static_remote_key',
        numConfirmations: 6,
        commitmentType: 'static_remote_key',
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
        lifecycleState: 'active',
      }

      const stateWithWallet = lightningReducer(
        initialLightningState,
        lightningActions.setLightningWallet('test-wallet', {
          nodePubkey: 'test-pubkey',
          channels: [mockChannel],
          payments: [],
          invoices: [],
          config: {
            nodeUrl: 'localhost:9735',
            type: 'lnd',
            authMethod: 'tls',
            maxFeeLimit: 100000,
            defaultCltvExpiry: 144,
            timeoutSeconds: 30,
          },
        }),
      )

      const removeAction = lightningActions.removeLightningChannel('test-wallet', 'test-channel')
      const result = lightningReducer(stateWithWallet, removeAction)

      expect(result.lightningWallets['test-wallet'].channels).toHaveLength(0)
    })

    it('should add lightning payment', () => {
      const mockPayment: LightningPayment = {
        paymentHash: 'test-hash',
        amount: 10000,
        fee: 1,
        status: 'succeeded',
        timestamp: Date.now(),
        paymentIndex: 1,
        htlcs: [],
      }

      const stateWithWallet = lightningReducer(
        initialLightningState,
        lightningActions.setLightningWallet('test-wallet', {
          nodePubkey: 'test-pubkey',
          channels: [],
          payments: [],
          invoices: [],
          config: {
            nodeUrl: 'localhost:9735',
            type: 'lnd',
            authMethod: 'tls',
            maxFeeLimit: 100000,
            defaultCltvExpiry: 144,
            timeoutSeconds: 30,
          },
        }),
      )

      const addAction = lightningActions.addLightningPayment('test-wallet', mockPayment)
      const result = lightningReducer(stateWithWallet, addAction)

      expect(result.lightningWallets['test-wallet'].payments).toHaveLength(1)
      expect(result.lightningWallets['test-wallet'].payments[0]).toEqual(mockPayment)
    })

    it('should add lightning invoice', () => {
      const mockInvoice: LightningInvoice = {
        paymentRequest: 'lnbc10n1p...',
        paymentHash: 'test-hash',
        amount: 10000,
        expiry: 3600,
        timestamp: Date.now(),
        payeePubKey: 'test-pubkey',
        minFinalCltvExpiry: 144,
        routingHints: [],
        features: [],
        signature: 'test-signature',
      }

      const stateWithWallet = lightningReducer(
        initialLightningState,
        lightningActions.setLightningWallet('test-wallet', {
          nodePubkey: 'test-pubkey',
          channels: [],
          payments: [],
          invoices: [],
          config: {
            nodeUrl: 'localhost:9735',
            type: 'lnd',
            authMethod: 'tls',
            maxFeeLimit: 100000,
            defaultCltvExpiry: 144,
            timeoutSeconds: 30,
          },
        }),
      )

      const addAction = lightningActions.addLightningInvoice('test-wallet', mockInvoice)
      const result = lightningReducer(stateWithWallet, addAction)

      expect(result.lightningWallets['test-wallet'].invoices).toHaveLength(1)
      expect(result.lightningWallets['test-wallet'].invoices[0]).toEqual(mockInvoice)
    })

    it('should handle actions on non-existent wallets gracefully', () => {
      const updateAction = lightningActions.updateLightningWallet('non-existent', {
        nodePubkey: 'test',
      })
      const result = lightningReducer(initialLightningState, updateAction)

      expect(result).toEqual(initialLightningState)

      const addChannelAction = lightningActions.addLightningChannel(
        'non-existent',
        {} as LightningChannel,
      )
      const result2 = lightningReducer(result, addChannelAction)

      expect(result2).toEqual(initialLightningState)
    })
  })

  describe('lightningSelectors', () => {
    const mockState: LightningState = {
      ...initialLightningState,
      lightningWallets: {
        'test-wallet': {
          nodePubkey: 'test-pubkey',
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
          payments: [
            {
              paymentHash: 'payment-1',
              amount: 10000,
              fee: 1,
              status: 'succeeded' as PaymentStatus,
              timestamp: Date.now(),
              paymentIndex: 1,
              htlcs: [],
            },
          ],
          invoices: [
            {
              paymentRequest: 'lnbc10n1p...',
              paymentHash: 'invoice-1',
              amount: 5000,
              expiry: 3600,
              timestamp: Date.now(),
              payeePubKey: 'test-pubkey',
              minFinalCltvExpiry: 144,
              routingHints: [],
              features: [],
              signature: 'test-signature',
            },
          ],
          config: {
            nodeUrl: 'localhost:9735',
            type: 'lnd',
            authMethod: 'tls',
            maxFeeLimit: 100000,
            defaultCltvExpiry: 144,
            timeoutSeconds: 30,
          },
        },
      },
      lightningConfigs: {
        'test-wallet': {
          nodeUrl: 'localhost:9735',
          type: 'lnd',
          authMethod: 'tls',
          maxFeeLimit: 100000,
          defaultCltvExpiry: 144,
          timeoutSeconds: 30,
        },
      },
      connectedNodes: {
        'test-wallet': true,
      },
    }

    it('should get lightning wallet', () => {
      const result = lightningSelectors.getLightningWallet(mockState, 'test-wallet')
      expect(result).toEqual(mockState.lightningWallets['test-wallet'])
    })

    it('should return null for non-existent wallet', () => {
      const result = lightningSelectors.getLightningWallet(mockState, 'non-existent')
      expect(result).toBeNull()
    })

    it('should get lightning config', () => {
      const result = lightningSelectors.getLightningConfig(mockState, 'test-wallet')
      expect(result).toEqual(mockState.lightningConfigs['test-wallet'])
    })

    it('should return null for non-existent config', () => {
      const result = lightningSelectors.getLightningConfig(mockState, 'non-existent')
      expect(result).toBeNull()
    })

    it('should get lightning channels', () => {
      const result = lightningSelectors.getLightningChannels(mockState, 'test-wallet')
      expect(result).toHaveLength(2)
      expect(result[0].channelId).toBe('active-channel')
    })

    it('should return empty array for non-existent wallet channels', () => {
      const result = lightningSelectors.getLightningChannels(mockState, 'non-existent')
      expect(result).toEqual([])
    })

    it('should get lightning payments', () => {
      const result = lightningSelectors.getLightningPayments(mockState, 'test-wallet')
      expect(result).toHaveLength(1)
      expect(result[0].paymentHash).toBe('payment-1')
    })

    it('should get lightning invoices', () => {
      const result = lightningSelectors.getLightningInvoices(mockState, 'test-wallet')
      expect(result).toHaveLength(1)
      expect(result[0].paymentHash).toBe('invoice-1')
    })

    it('should calculate lightning balance correctly', () => {
      const result = lightningSelectors.getLightningBalance(mockState, 'test-wallet')
      expect(result).toBe(100000) // Only active channel balance
    })

    it('should return 0 balance for non-existent wallet', () => {
      const result = lightningSelectors.getLightningBalance(mockState, 'non-existent')
      expect(result).toBe(0)
    })

    it('should check node connection', () => {
      const result = lightningSelectors.isNodeConnected(mockState, 'test-wallet')
      expect(result).toBe(true)
    })

    it('should return false for non-connected node', () => {
      const result = lightningSelectors.isNodeConnected(mockState, 'non-existent')
      expect(result).toBe(false)
    })
  })

  describe('lightningActions', () => {
    it('should create setLightningWallet action', () => {
      const mockWalletData: LightningWalletData = {
        nodePubkey: 'test-pubkey',
        channels: [],
        payments: [],
        invoices: [],
        config: {
          nodeUrl: 'localhost:9735',
          type: 'lnd',
          authMethod: 'tls',
          maxFeeLimit: 100000,
          defaultCltvExpiry: 144,
          timeoutSeconds: 30,
        },
      }

      const action = lightningActions.setLightningWallet('test-wallet', mockWalletData)

      expect(action.type).toBe('SET_LIGHTNING_WALLET')
      expect((action.payload as any).walletId).toBe('test-wallet')
      expect((action.payload as any).data).toEqual(mockWalletData)
    })

    it('should create updateLightningWallet action', () => {
      const updates = { nodePubkey: 'updated-pubkey' }
      const action = lightningActions.updateLightningWallet('test-wallet', updates)

      expect(action.type).toBe('UPDATE_LIGHTNING_WALLET')
      expect((action.payload as any).walletId).toBe('test-wallet')
      expect((action.payload as any).updates).toEqual(updates)
    })

    it('should create deleteLightningWallet action', () => {
      const action = lightningActions.deleteLightningWallet('test-wallet')

      expect(action.type).toBe('DELETE_LIGHTNING_WALLET')
      expect(action.payload).toBe('test-wallet')
    })

    it('should create setLightningConfig action', () => {
      const config: LightningConfig = {
        nodeUrl: 'localhost:9735',
        type: 'lnd',
        authMethod: 'tls',
        maxFeeLimit: 100000,
        defaultCltvExpiry: 144,
        timeoutSeconds: 30,
      }

      const action = lightningActions.setLightningConfig('test-wallet', config)

      expect(action.type).toBe('SET_LIGHTNING_CONFIG')
      expect((action.payload as any).walletId).toBe('test-wallet')
      expect((action.payload as any).config).toEqual(config)
    })

    it('should create setLoadingLightning action', () => {
      const action = lightningActions.setLoadingLightning(true)

      expect(action.type).toBe('SET_LOADING_LIGHTNING')
      expect(action.payload).toBe(true)
    })

    it('should create setNodeConnection action', () => {
      const action = lightningActions.setNodeConnection('test-wallet', true)

      expect(action.type).toBe('SET_NODE_CONNECTION')
      expect((action.payload as any).walletId).toBe('test-wallet')
      expect((action.payload as any).connected).toBe(true)
    })

    it('should create addLightningChannel action', () => {
      const mockChannel: LightningChannel = {
        channelId: 'test-channel',
        channelPoint: 'txid:0',
        localBalance: 100000,
        remoteBalance: 50000,
        capacity: 150000,
        remotePubkey: 'remote-pubkey',
        status: 'active',
        channelType: 'static_remote_key',
        numConfirmations: 6,
        commitmentType: 'static_remote_key',
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
        lifecycleState: 'active',
      }

      const action = lightningActions.addLightningChannel('test-wallet', mockChannel)

      expect(action.type).toBe('ADD_LIGHTNING_CHANNEL')
      expect((action.payload as any).walletId).toBe('test-wallet')
      expect((action.payload as any).channel).toEqual(mockChannel)
    })

    it('should create addLightningPayment action', () => {
      const mockPayment: LightningPayment = {
        paymentHash: 'test-hash',
        amount: 10000,
        fee: 1,
        status: 'succeeded',
        timestamp: Date.now(),
        paymentIndex: 1,
        htlcs: [],
      }

      const action = lightningActions.addLightningPayment('test-wallet', mockPayment)

      expect(action.type).toBe('ADD_LIGHTNING_PAYMENT')
      expect((action.payload as any).walletId).toBe('test-wallet')
      expect((action.payload as any).payment).toEqual(mockPayment)
    })

    it('should create addLightningInvoice action', () => {
      const mockInvoice: LightningInvoice = {
        paymentRequest: 'lnbc10n1p...',
        paymentHash: 'test-hash',
        amount: 10000,
        expiry: 3600,
        timestamp: Date.now(),
        payeePubKey: 'test-pubkey',
        minFinalCltvExpiry: 144,
        routingHints: [],
        features: [],
        signature: 'test-signature',
      }

      const action = lightningActions.addLightningInvoice('test-wallet', mockInvoice)

      expect(action.type).toBe('ADD_LIGHTNING_INVOICE')
      expect((action.payload as any).walletId).toBe('test-wallet')
      expect((action.payload as any).invoice).toEqual(mockInvoice)
    })
  })
})
