/**
 * Tests for Lightning Persistence Layer
 * Tests the LightningRepository integration with LightningWorker
 */

import lightningRepository, {
  LightningRepository,
  PersistedChannel,
  PersistedPeer,
  PersistedPreimage,
  PersistedPaymentInfo,
  PersistedInvoice,
  RoutingNode,
  RoutingChannel,
} from '@/core/repositories/lightning'

// Mock MMKV
jest.mock('react-native-mmkv', () => {
  const storage = new Map<string, string>()
  return {
    MMKV: jest.fn().mockImplementation(() => ({
      set: (key: string, value: string) => storage.set(key, value),
      getString: (key: string) => storage.get(key),
      delete: (key: string) => storage.delete(key),
      clearAll: () => storage.clear(),
    })),
  }
})

describe('LightningRepository', () => {
  let repository: LightningRepository

  beforeEach(() => {
    repository = new LightningRepository()
    repository.clearAll()
  })

  afterEach(() => {
    repository.clearAll()
  })

  // ==========================================
  // CHANNEL PERSISTENCE
  // ==========================================

  describe('Channels', () => {
    const testChannel: PersistedChannel = {
      channelId: 'test-channel-123',
      nodeId: '02' + '00'.repeat(32),
      state: 'normal',
      fundingTxid: 'abc123',
      fundingOutputIndex: 0,
      localBalance: '1000000',
      remoteBalance: '500000',
      localConfig: { isInitiator: true },
      remoteConfig: {},
      createdAt: Date.now(),
      lastActivity: Date.now(),
    }

    describe('saveChannel', () => {
      it('should save channel', () => {
        repository.saveChannel(testChannel)
        const retrieved = repository.findChannelById(testChannel.channelId)
        expect(retrieved).toEqual(testChannel)
      })

      it('should update existing channel', () => {
        repository.saveChannel(testChannel)
        const updatedChannel = { ...testChannel, state: 'closed' }
        repository.saveChannel(updatedChannel)

        const retrieved = repository.findChannelById(testChannel.channelId)
        expect(retrieved?.state).toBe('closed')
      })
    })

    describe('findChannelById', () => {
      it('should return null for non-existent channel', () => {
        const result = repository.findChannelById('non-existent')
        expect(result).toBeNull()
      })

      it('should return channel by id', () => {
        repository.saveChannel(testChannel)
        const result = repository.findChannelById(testChannel.channelId)
        expect(result).toEqual(testChannel)
      })
    })

    describe('findAllChannels', () => {
      it('should return empty object when no channels', () => {
        const result = repository.findAllChannels()
        expect(result).toEqual({})
      })

      it('should return all channels', () => {
        const channel1 = { ...testChannel, channelId: 'channel1' }
        const channel2 = { ...testChannel, channelId: 'channel2' }

        repository.saveChannel(channel1)
        repository.saveChannel(channel2)

        const result = repository.findAllChannels()
        expect(Object.keys(result)).toHaveLength(2)
        expect(result['channel1']).toEqual(channel1)
        expect(result['channel2']).toEqual(channel2)
      })
    })

    describe('deleteChannel', () => {
      it('should delete channel', () => {
        repository.saveChannel(testChannel)
        repository.deleteChannel(testChannel.channelId)

        const result = repository.findChannelById(testChannel.channelId)
        expect(result).toBeNull()
      })
    })
  })

  // ==========================================
  // PEER PERSISTENCE
  // ==========================================

  describe('Peers', () => {
    const testPeer: PersistedPeer = {
      nodeId: '02' + '00'.repeat(32),
      host: '127.0.0.1',
      port: 9735,
      pubkey: '02' + '00'.repeat(32),
      lastConnected: Date.now(),
      features: 'basic',
    }

    describe('savePeer', () => {
      it('should save peer', () => {
        repository.savePeer(testPeer)
        const retrieved = repository.findPeerById(testPeer.nodeId)
        expect(retrieved).toEqual(testPeer)
      })
    })

    describe('findPeerById', () => {
      it('should return null for non-existent peer', () => {
        const result = repository.findPeerById('non-existent')
        expect(result).toBeNull()
      })
    })

    describe('findAllPeers', () => {
      it('should return all peers', () => {
        const peer1 = { ...testPeer, nodeId: 'peer1' }
        const peer2 = { ...testPeer, nodeId: 'peer2' }

        repository.savePeer(peer1)
        repository.savePeer(peer2)

        const result = repository.findAllPeers()
        expect(Object.keys(result)).toHaveLength(2)
      })
    })

    describe('deletePeer', () => {
      it('should delete peer', () => {
        repository.savePeer(testPeer)
        repository.deletePeer(testPeer.nodeId)

        const result = repository.findPeerById(testPeer.nodeId)
        expect(result).toBeNull()
      })
    })
  })

  // ==========================================
  // PREIMAGE PERSISTENCE
  // ==========================================

  describe('Preimages', () => {
    const testPreimage: PersistedPreimage = {
      paymentHash: 'hash123',
      preimage: '00'.repeat(32),
      createdAt: Date.now(),
    }

    describe('savePreimage', () => {
      it('should save preimage', () => {
        repository.savePreimage(testPreimage)
        const retrieved = repository.findPreimageByHash(testPreimage.paymentHash)
        expect(retrieved).toEqual(testPreimage)
      })
    })

    describe('findPreimageByHash', () => {
      it('should return null for non-existent preimage', () => {
        const result = repository.findPreimageByHash('non-existent')
        expect(result).toBeNull()
      })
    })

    describe('findAllPreimages', () => {
      it('should return all preimages', () => {
        const preimage1 = { ...testPreimage, paymentHash: 'hash1' }
        const preimage2 = { ...testPreimage, paymentHash: 'hash2' }

        repository.savePreimage(preimage1)
        repository.savePreimage(preimage2)

        const result = repository.findAllPreimages()
        expect(Object.keys(result)).toHaveLength(2)
      })
    })

    describe('deletePreimage', () => {
      it('should delete preimage', () => {
        repository.savePreimage(testPreimage)
        repository.deletePreimage(testPreimage.paymentHash)

        const result = repository.findPreimageByHash(testPreimage.paymentHash)
        expect(result).toBeNull()
      })
    })
  })

  // ==========================================
  // PAYMENT INFO PERSISTENCE
  // ==========================================

  describe('Payment Info', () => {
    const testPaymentInfo: PersistedPaymentInfo = {
      paymentHash: 'hash123',
      amountMsat: '1000000',
      direction: 'sent',
      status: 'completed',
      expiryDelay: 144,
      createdAt: Date.now(),
    }

    describe('savePaymentInfo', () => {
      it('should save payment info', () => {
        repository.savePaymentInfo(testPaymentInfo)
        const retrieved = repository.findPaymentInfoByHash(testPaymentInfo.paymentHash)
        expect(retrieved).toEqual(testPaymentInfo)
      })
    })

    describe('findPaymentInfoByHash', () => {
      it('should return null for non-existent payment', () => {
        const result = repository.findPaymentInfoByHash('non-existent')
        expect(result).toBeNull()
      })
    })

    describe('findAllPaymentInfos', () => {
      it('should return all payment infos', () => {
        const payment1 = { ...testPaymentInfo, paymentHash: 'hash1' }
        const payment2 = { ...testPaymentInfo, paymentHash: 'hash2' }

        repository.savePaymentInfo(payment1)
        repository.savePaymentInfo(payment2)

        const result = repository.findAllPaymentInfos()
        expect(Object.keys(result)).toHaveLength(2)
      })
    })
  })

  // ==========================================
  // INVOICE PERSISTENCE
  // ==========================================

  describe('Invoices', () => {
    const testInvoice: PersistedInvoice = {
      paymentHash: 'hash123',
      bolt11: 'lnbc1000n...',
      amountMsat: '1000000',
      description: 'Test invoice',
      expiry: 3600,
      createdAt: Date.now(),
    }

    describe('saveInvoice', () => {
      it('should save invoice', () => {
        repository.saveInvoice(testInvoice)
        const retrieved = repository.findInvoiceByHash(testInvoice.paymentHash)
        expect(retrieved).toEqual(testInvoice)
      })
    })

    describe('findInvoiceByHash', () => {
      it('should return null for non-existent invoice', () => {
        const result = repository.findInvoiceByHash('non-existent')
        expect(result).toBeNull()
      })
    })

    describe('findAllInvoices', () => {
      it('should return all invoices', () => {
        const invoice1 = { ...testInvoice, paymentHash: 'hash1' }
        const invoice2 = { ...testInvoice, paymentHash: 'hash2' }

        repository.saveInvoice(invoice1)
        repository.saveInvoice(invoice2)

        const result = repository.findAllInvoices()
        expect(Object.keys(result)).toHaveLength(2)
      })
    })
  })

  // ==========================================
  // NODE KEY PERSISTENCE
  // ==========================================

  describe('Node Key', () => {
    describe('saveNodeKey / getNodeKey', () => {
      it('should save and retrieve node key', () => {
        const nodeKey = new Uint8Array(32).fill(0xab)
        repository.saveNodeKey(nodeKey)

        const retrieved = repository.getNodeKey()
        expect(retrieved).toEqual(nodeKey)
      })

      it('should return null when no node key', () => {
        const result = repository.getNodeKey()
        expect(result).toBeNull()
      })
    })
  })

  // ==========================================
  // CHANNEL SEEDS PERSISTENCE
  // ==========================================

  describe('Channel Seeds', () => {
    describe('saveChannelSeed / getChannelSeed', () => {
      it('should save and retrieve channel seed', () => {
        const channelId = 'test-channel'
        const seed = new Uint8Array(32).fill(0xcd)

        repository.saveChannelSeed(channelId, seed)

        const retrieved = repository.getChannelSeed(channelId)
        expect(retrieved).toEqual(seed)
      })

      it('should return null for non-existent seed', () => {
        const result = repository.getChannelSeed('non-existent')
        expect(result).toBeNull()
      })
    })

    describe('getAllChannelSeeds', () => {
      it('should return all channel seeds', () => {
        repository.saveChannelSeed('channel1', new Uint8Array(32).fill(0x01))
        repository.saveChannelSeed('channel2', new Uint8Array(32).fill(0x02))

        const result = repository.getAllChannelSeeds()
        expect(Object.keys(result)).toHaveLength(2)
      })
    })
  })

  // ==========================================
  // ROUTING GRAPH PERSISTENCE
  // ==========================================

  describe('Routing Graph', () => {
    const testNode: RoutingNode = {
      nodeId: '02' + '00'.repeat(32),
      features: 'basic',
      addresses: [{ host: '127.0.0.1', port: 9735 }],
      lastUpdate: Date.now(),
    }

    const testChannel: RoutingChannel = {
      shortChannelId: 'scid123',
      node1: '02' + '00'.repeat(32),
      node2: '03' + '00'.repeat(32),
      capacity: '1000000',
      feeBaseMsat: 1000,
      feeProportionalMillionths: 1,
      cltvDelta: 40,
      lastUpdate: Date.now(),
    }

    describe('saveRoutingNode', () => {
      it('should save routing node', () => {
        repository.saveRoutingNode(testNode)
        const graph = repository.getRoutingGraph()
        expect(graph.nodes[testNode.nodeId]).toEqual(testNode)
      })
    })

    describe('saveRoutingChannel', () => {
      it('should save routing channel', () => {
        repository.saveRoutingChannel(testChannel)
        const graph = repository.getRoutingGraph()
        expect(graph.channels[testChannel.shortChannelId]).toEqual(testChannel)
      })
    })

    describe('getRoutingGraph', () => {
      it('should return empty graph when no data', () => {
        const graph = repository.getRoutingGraph()
        expect(graph.nodes).toEqual({})
        expect(graph.channels).toEqual({})
      })

      it('should return populated graph', () => {
        repository.saveRoutingNode(testNode)
        repository.saveRoutingChannel(testChannel)

        const graph = repository.getRoutingGraph()
        expect(Object.keys(graph.nodes)).toHaveLength(1)
        expect(Object.keys(graph.channels)).toHaveLength(1)
      })
    })
  })

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  describe('Utility Methods', () => {
    describe('clearAll', () => {
      it('should clear all data', () => {
        repository.saveChannel({
          channelId: 'test',
          nodeId: 'node',
          state: 'normal',
          localBalance: '0',
          remoteBalance: '0',
          localConfig: {},
          remoteConfig: {},
        })
        repository.savePeer({
          nodeId: 'peer',
          host: '127.0.0.1',
          port: 9735,
          pubkey: 'pub',
        })

        repository.clearAll()

        expect(repository.findAllChannels()).toEqual({})
        expect(repository.findAllPeers()).toEqual({})
      })
    })

    describe('exportData / importData', () => {
      it('should export all data as JSON', () => {
        repository.saveChannel({
          channelId: 'test-channel',
          nodeId: 'node',
          state: 'normal',
          localBalance: '1000',
          remoteBalance: '500',
          localConfig: {},
          remoteConfig: {},
        })

        const exported = repository.exportData()
        expect(typeof exported).toBe('string')

        const parsed = JSON.parse(exported)
        expect(parsed.channels).toBeDefined()
        expect(parsed.channels['test-channel']).toBeDefined()
      })

      it('should import data from JSON', () => {
        const data = JSON.stringify({
          channels: {
            'imported-channel': {
              channelId: 'imported-channel',
              nodeId: 'node',
              state: 'normal',
              localBalance: '2000',
              remoteBalance: '1000',
              localConfig: {},
              remoteConfig: {},
            },
          },
          peers: {},
          preimages: {},
          payments: {},
          invoices: {},
          channelSeeds: {},
          routingGraph: { nodes: {}, channels: {} },
        })

        repository.importData(data)

        const channel = repository.findChannelById('imported-channel')
        expect(channel).not.toBeNull()
        expect(channel?.localBalance).toBe('2000')
      })
    })
  })
})
