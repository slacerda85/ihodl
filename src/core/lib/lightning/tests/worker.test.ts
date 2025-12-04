import { LightningWorker, ChannelState } from '../worker'
import { LightningConnection } from '@/core/models/lightning/client'
import { LightningMessageType } from '@/core/models/lightning/base'
import lightningRepository from '@/core/repositories/lightning'

// Mock all dependencies at module level
jest.mock('../transport')
jest.mock('../base')
jest.mock('../invoice', () => ({
  encodeInvoice: jest.fn().mockReturnValue('lnbc1000n1p0x9z9pp5...'),
  decodeInvoice: jest.fn().mockReturnValue({
    currency: 'lnbc',
    amount: 1000000n,
    taggedFields: {
      paymentHash: new Uint8Array(32),
      description: 'test',
    },
  }),
}))
jest.mock('../../key', () => ({
  deriveChildKey: jest.fn().mockReturnValue(new Uint8Array(64)),
  createPublicKey: jest.fn().mockReturnValue(new Uint8Array(33)),
}))
jest.mock('../../crypto/crypto', () => ({
  sha256: jest.fn().mockReturnValue(new Uint8Array(32)),
  randomBytes: jest.fn().mockReturnValue(new Uint8Array(32)),
  hash160: jest.fn().mockReturnValue(new Uint8Array(20)),
}))
jest.mock('../../utils', () => ({
  uint8ArrayToHex: jest.fn().mockImplementation((arr: Uint8Array) =>
    Array.from(arr)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''),
  ),
  hexToUint8Array: jest.fn().mockImplementation((hex: string) => {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
    }
    return bytes
  }),
}))
jest.mock('@/core/lib/network/socket', () => ({
  createLightningSocket: jest.fn().mockResolvedValue({}),
}))
jest.mock('@/core/repositories/lightning', () => ({
  __esModule: true,
  default: {
    saveChannel: jest.fn(),
    findChannelById: jest.fn(),
    findAllChannels: jest.fn().mockReturnValue({}),
    deleteChannel: jest.fn(),
    savePeer: jest.fn(),
    findPeerById: jest.fn(),
    findAllPeers: jest.fn().mockReturnValue({}),
    deletePeer: jest.fn(),
    savePreimage: jest.fn(),
    findPreimageByHash: jest.fn(),
    findAllPreimages: jest.fn().mockReturnValue({}),
    deletePreimage: jest.fn(),
    savePaymentInfo: jest.fn(),
    findPaymentInfoByHash: jest.fn(),
    findAllPaymentInfos: jest.fn().mockReturnValue({}),
    saveInvoice: jest.fn(),
    findInvoiceByHash: jest.fn(),
    findAllInvoices: jest.fn().mockReturnValue({}),
    saveNodeKey: jest.fn(),
    getNodeKey: jest.fn().mockReturnValue(null),
    saveChannelSeed: jest.fn(),
    getChannelSeed: jest.fn().mockReturnValue(null),
    getAllChannelSeeds: jest.fn().mockReturnValue({}),
    saveRoutingNode: jest.fn(),
    saveRoutingChannel: jest.fn(),
    getRoutingGraph: jest.fn().mockReturnValue({ nodes: {}, channels: {} }),
    clearAll: jest.fn(),
    exportData: jest.fn().mockReturnValue('{}'),
    importData: jest.fn(),
  },
}))

describe('LightningWorker', () => {
  let mockConnection: LightningConnection
  let mockMasterKey: Uint8Array
  let worker: LightningWorker

  beforeEach(() => {
    mockConnection = {
      destroy: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
      write: jest.fn(),
    } as unknown as LightningConnection
    mockMasterKey = new Uint8Array(64)
    worker = new LightningWorker(mockConnection, mockMasterKey, 'mainnet')
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // ==========================================
  // CONSTRUCTOR & INITIALIZATION
  // ==========================================

  describe('constructor', () => {
    it('should initialize with provided parameters', () => {
      expect(worker).toBeInstanceOf(LightningWorker)
    })

    it('should initialize with default network (mainnet)', () => {
      const defaultWorker = new LightningWorker(mockConnection, mockMasterKey)
      expect(defaultWorker).toBeInstanceOf(LightningWorker)
    })

    it('should initialize with testnet', () => {
      const testnetWorker = new LightningWorker(mockConnection, mockMasterKey, 'testnet')
      expect(testnetWorker).toBeInstanceOf(LightningWorker)
    })

    it('should initialize with regtest', () => {
      const regtestWorker = new LightningWorker(mockConnection, mockMasterKey, 'regtest')
      expect(regtestWorker).toBeInstanceOf(LightningWorker)
    })
  })

  // ==========================================
  // PERSISTENCE & INITIALIZATION FROM STORAGE
  // ==========================================

  describe('initializeFromStorage', () => {
    it('should initialize from storage without errors', async () => {
      await expect(worker.initializeFromStorage()).resolves.not.toThrow()
    })

    it('should restore node key if exists', async () => {
      const mockNodeKey = new Uint8Array(32).fill(1)
      ;(lightningRepository.getNodeKey as jest.Mock).mockReturnValueOnce(mockNodeKey)

      await worker.initializeFromStorage()

      expect(lightningRepository.getNodeKey).toHaveBeenCalled()
    })

    it('should generate and save new node key if not exists', async () => {
      ;(lightningRepository.getNodeKey as jest.Mock).mockReturnValueOnce(null)

      await worker.initializeFromStorage()

      expect(lightningRepository.saveNodeKey).toHaveBeenCalled()
    })

    it('should restore channels from storage', async () => {
      const mockChannels = {
        channel1: {
          channelId: 'channel1',
          nodeId: '02' + '00'.repeat(32),
          state: 'normal',
          localBalance: '1000000',
          remoteBalance: '500000',
          fundingTxid: 'abc123',
          fundingOutputIndex: 0,
          localConfig: {},
          remoteConfig: {},
        },
      }
      ;(lightningRepository.findAllChannels as jest.Mock).mockReturnValueOnce(mockChannels)

      await worker.initializeFromStorage()

      expect(lightningRepository.findAllChannels).toHaveBeenCalled()
    })

    it('should restore preimages from storage', async () => {
      const mockPreimages = {
        hash1: {
          paymentHash: 'hash1',
          preimage: '00'.repeat(32),
          createdAt: Date.now(),
        },
      }
      ;(lightningRepository.findAllPreimages as jest.Mock).mockReturnValueOnce(mockPreimages)

      await worker.initializeFromStorage()

      expect(lightningRepository.findAllPreimages).toHaveBeenCalled()
    })

    it('should restore routing graph from storage', async () => {
      const mockGraph = {
        nodes: {
          node1: {
            nodeId: '02' + '00'.repeat(32),
            features: '',
            addresses: [{ host: '127.0.0.1', port: 9735 }],
            lastUpdate: Date.now(),
          },
        },
        channels: {
          scid1: {
            shortChannelId: 'scid1',
            node1: '02' + '00'.repeat(32),
            node2: '03' + '00'.repeat(32),
            capacity: '1000000',
            feeBaseMsat: 1000,
            feeProportionalMillionths: 1,
            cltvDelta: 40,
            lastUpdate: Date.now(),
          },
        },
      }
      ;(lightningRepository.getRoutingGraph as jest.Mock).mockReturnValueOnce(mockGraph)

      await worker.initializeFromStorage()

      expect(lightningRepository.getRoutingGraph).toHaveBeenCalled()
    })
  })

  describe('persistChannelState', () => {
    it('should persist channel state to repository', async () => {
      // Setup internal channel state
      const channelId = 'test-channel-id'
      ;(worker as any).channels.set(channelId, {
        channelId,
        peerId: 'peer-id',
        state: ChannelState.NORMAL,
        localBalance: 1000000n,
        remoteBalance: 500000n,
        capacity: 1500000n,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      })
      ;(worker as any).channelStates.set(channelId, ChannelState.NORMAL)

      await worker.persistChannelState(channelId)

      expect(lightningRepository.saveChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId,
          nodeId: 'peer-id',
          state: 'normal',
        }),
      )
    })

    it('should warn for unknown channel', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      await worker.persistChannelState('unknown-channel')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot persist unknown channel'),
      )
      consoleSpy.mockRestore()
    })
  })

  describe('persistPreimage', () => {
    it('should persist preimage to repository', async () => {
      const paymentHash = 'test-hash'
      const preimage = new Uint8Array(32).fill(0xab)

      await worker.persistPreimage(paymentHash, preimage)

      expect(lightningRepository.savePreimage).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentHash,
        }),
      )
    })
  })

  describe('persistRoutingGraph', () => {
    it('should persist routing graph to repository', async () => {
      // Add some nodes and channels to routing graph
      ;(worker as any).routingGraph.addNode({
        nodeId: new Uint8Array(33).fill(0x02),
        lastUpdate: Date.now(),
        addresses: [],
      })

      await worker.persistRoutingGraph()

      expect(lightningRepository.saveRoutingNode).toHaveBeenCalled()
    })
  })

  describe('persistInvoice', () => {
    it('should persist invoice to repository', async () => {
      await worker.persistInvoice('hash123', 'lnbc...', 1000000n, 'test invoice', 3600)

      expect(lightningRepository.saveInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentHash: 'hash123',
          bolt11: 'lnbc...',
          description: 'test invoice',
        }),
      )
    })
  })

  describe('exportAllData / importAllData', () => {
    it('should export all data', () => {
      const exported = worker.exportAllData()
      expect(lightningRepository.exportData).toHaveBeenCalled()
      expect(typeof exported).toBe('string')
    })

    it('should import all data', () => {
      const data = '{"channels": {}}'
      worker.importAllData(data)
      expect(lightningRepository.importData).toHaveBeenCalledWith(data)
    })
  })

  // ==========================================
  // MESSAGE LOOP
  // ==========================================

  describe('Message Loop', () => {
    describe('startMessageLoop', () => {
      it('should start message loop', async () => {
        // Setup connection mock with on method
        ;(mockConnection as any).on = jest.fn()
        ;(mockConnection as any).transportKeys = {
          sendingKey: new Uint8Array(32),
          receivingKey: new Uint8Array(32),
          sendingNonce: 0n,
          receivingNonce: 0n,
        }

        await worker.startMessageLoop()

        expect((worker as any).messageLoopRunning).toBe(true)
      })

      it('should not start if already running', async () => {
        ;(mockConnection as any).on = jest.fn()
        ;(mockConnection as any).transportKeys = {
          sendingKey: new Uint8Array(32),
          receivingKey: new Uint8Array(32),
          sendingNonce: 0n,
          receivingNonce: 0n,
        }
        ;(worker as any).messageLoopRunning = true

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        await worker.startMessageLoop()

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Message loop already running'),
        )
        consoleSpy.mockRestore()
      })
    })

    describe('stopMessageLoop', () => {
      it('should stop message loop', async () => {
        ;(mockConnection as any).on = jest.fn()
        ;(mockConnection as any).removeListener = jest.fn()
        ;(mockConnection as any).transportKeys = {
          sendingKey: new Uint8Array(32),
          receivingKey: new Uint8Array(32),
          sendingNonce: 0n,
          receivingNonce: 0n,
        }

        await worker.startMessageLoop()
        worker.stopMessageLoop()

        expect((worker as any).messageLoopRunning).toBe(false)
      })
    })

    describe('handleDecryptedMessage', () => {
      it('should handle PING message', async () => {
        const pingMessage = new Uint8Array([
          (LightningMessageType.PING >> 8) & 0xff,
          LightningMessageType.PING & 0xff,
          0,
          1, // num_pong_bytes
          0,
          0, // byteslen
        ])

        // Should not throw
        await (worker as any).handleDecryptedMessage(pingMessage, 'peer-id')
      })

      it('should handle ERROR message', async () => {
        const errorMessage = new Uint8Array(36 + 5)
        errorMessage[0] = (LightningMessageType.ERROR >> 8) & 0xff
        errorMessage[1] = LightningMessageType.ERROR & 0xff
        // channel_id (32 bytes)
        errorMessage[34] = 0 // len high
        errorMessage[35] = 5 // len low
        // error data
        new TextEncoder().encode('error').forEach((b, i) => (errorMessage[36 + i] = b))

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

        await (worker as any).handleDecryptedMessage(errorMessage, 'peer-id')

        expect(consoleSpy).toHaveBeenCalled()
        consoleSpy.mockRestore()
      })

      it('should handle WARNING message', async () => {
        const warningMessage = new Uint8Array(36 + 7)
        warningMessage[0] = (LightningMessageType.WARNING >> 8) & 0xff
        warningMessage[1] = LightningMessageType.WARNING & 0xff
        warningMessage[34] = 0
        warningMessage[35] = 7
        new TextEncoder().encode('warning').forEach((b, i) => (warningMessage[36 + i] = b))

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

        await (worker as any).handleDecryptedMessage(warningMessage, 'peer-id')

        expect(consoleSpy).toHaveBeenCalled()
        consoleSpy.mockRestore()
      })

      it('should ignore unknown odd message types', async () => {
        // Odd message types >= 32768 should be ignored
        const oddMessage = new Uint8Array([
          0x80,
          0x01, // 32769 (odd)
          0x00,
          0x00,
        ])

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        await (worker as any).handleDecryptedMessage(oddMessage, 'peer-id')

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring unknown odd'))
        consoleSpy.mockRestore()
      })

      it('should warn for message too short', async () => {
        const shortMessage = new Uint8Array([0x00])

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

        await (worker as any).handleDecryptedMessage(shortMessage, 'peer-id')

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Message too short'))
        consoleSpy.mockRestore()
      })
    })
  })

  // ==========================================
  // CHANNEL OPERATIONS
  // ==========================================

  describe('hasActiveChannels', () => {
    it('should return false when no channels', async () => {
      const result = await worker.hasActiveChannels()
      expect(result).toBe(false)
    })

    it('should return true when has open channels', async () => {
      ;(worker as any).channels.set('channel1', {
        channelId: 'channel1',
        state: ChannelState.NORMAL,
      })
      ;(worker as any).channelStates.set('channel1', ChannelState.NORMAL)

      const result = await worker.hasActiveChannels()
      expect(result).toBe(true)
    })
  })

  describe('getBalance', () => {
    it('should return 0n when no channels', async () => {
      const result = await worker.getBalance()
      expect(result).toBe(0n)
    })

    it('should return sum of local balances', async () => {
      ;(worker as any).channels.set('channel1', {
        channelId: 'channel1',
        state: ChannelState.NORMAL,
        localBalance: 1000000n,
      })
      ;(worker as any).channelStates.set('channel1', ChannelState.NORMAL)
      ;(worker as any).channels.set('channel2', {
        channelId: 'channel2',
        state: ChannelState.NORMAL,
        localBalance: 500000n,
      })
      ;(worker as any).channelStates.set('channel2', ChannelState.NORMAL)

      const result = await worker.getBalance()
      expect(result).toBe(1500000n)
    })
  })

  // ==========================================
  // PEER MANAGEMENT
  // ==========================================

  describe('getConnectedPeers', () => {
    it('should return empty array when no peers', () => {
      const peers = worker.getConnectedPeers()
      expect(peers).toEqual([])
    })
  })

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  describe('private methods (tested indirectly)', () => {
    it('should calculate channel opening fee', () => {
      const fee = (worker as any).calculateChannelOpeningFee(100000n)
      expect(typeof fee).toBe('bigint')
      expect(fee).toBeGreaterThan(0n)
    })

    it('should derive lightning key', () => {
      const key = (worker as any).deriveLightningKey(0)
      expect(key).toBeInstanceOf(Uint8Array)
      expect(key.length).toBe(64) // mocked
    })

    it('should generate payment credentials', () => {
      const creds = (worker as any).generatePaymentCredentials()
      expect(creds).toHaveProperty('paymentHash')
      expect(creds).toHaveProperty('paymentSecret')
      expect(creds).toHaveProperty('preimage')
    })

    it('should convert channel state to string', () => {
      const stateStr = (worker as any).channelStateToString(ChannelState.NORMAL)
      expect(stateStr).toBe('normal')
    })

    it('should parse channel state from string', () => {
      const state = (worker as any).parseChannelState('normal')
      expect(state).toBe(ChannelState.NORMAL)
    })
  })

  // ==========================================
  // CLOSE CONNECTION
  // ==========================================

  describe('close', () => {
    it('should close connection', async () => {
      mockConnection.destroy = jest.fn()
      ;(mockConnection as any).cleanup = jest.fn()

      await worker.close()

      expect(mockConnection.destroy).toHaveBeenCalled()
    })

    it('should call cleanup if available', async () => {
      mockConnection.destroy = jest.fn()
      ;(mockConnection as any).cleanup = jest.fn()

      await worker.close()

      expect((mockConnection as any).cleanup).toHaveBeenCalled()
    })
  })
})

// ==========================================
// CHANNEL STATE ENUM TESTS
// ==========================================

describe('ChannelState enum', () => {
  it('should have all required states', () => {
    expect(ChannelState.PENDING_OPEN).toBe('pending_open')
    expect(ChannelState.OPENING).toBe('opening')
    expect(ChannelState.CHANNEL_READY).toBe('channel_ready')
    expect(ChannelState.FUNDING_CONFIRMED).toBe('funding_confirmed')
    expect(ChannelState.NORMAL).toBe('normal')
    expect(ChannelState.SHUTTING_DOWN).toBe('shutting_down')
    expect(ChannelState.CLOSING).toBe('closing')
    expect(ChannelState.CLOSED).toBe('closed')
    expect(ChannelState.ERROR).toBe('error')
  })
})
