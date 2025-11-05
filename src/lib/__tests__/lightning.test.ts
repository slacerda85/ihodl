import {
  generateInvoice,
  payInvoice,
  openChannel,
  closeChannel,
  getWalletInfo,
  getChannels,
  connectPeer,
  getNodeInfo,
  decodeInvoice,
} from '../lightning/index'

// Mock das dependências
jest.mock('../key', () => ({
  deriveChildPrivateKey: jest.fn(),
  createHardenedIndex: jest.fn(),
  createPublicKey: jest.fn(),
  splitRootExtendedKey: jest.fn(),
}))

jest.mock('../address', () => ({
  createSegwitAddress: jest.fn(),
}))

jest.mock('../crypto', () => ({
  uint8ArrayToHex: jest.fn(),
  signMessage: jest.fn().mockReturnValue(new Uint8Array(64)),
  encode: jest.fn().mockReturnValue('lntb1000n1testinvoice'),
  sha256: jest.fn(data => {
    // Simple mock implementation - return a Uint8Array of 32 bytes
    const result = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      result[i] = data[i % data.length] || 0
    }
    return result
  }),
}))

describe('Lightning Network Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateInvoice', () => {
    it('should generate a valid Lightning invoice', async () => {
      const amount = 1000
      const description = 'Test payment'

      const invoice = await generateInvoice(amount, description)

      expect(invoice).toBeDefined()
      expect(invoice.amount).toBe(amount) // Should be exact amount when channels exist
      expect(invoice.description).toBe(description)
      expect(invoice.paymentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(invoice.paymentRequest).toBe('lntb1000n1testinvoice')
      expect(invoice.status).toBe('pending')
      expect(invoice.expiry).toBeGreaterThan(Date.now() / 1000)
    })

    it('should reject invalid amounts', async () => {
      await expect(generateInvoice(-100)).rejects.toThrow('Invalid invoice amount')
      // Note: 0 is now allowed in mock implementation
    })

    it('should generate invoice without description', async () => {
      const amount = 500

      const invoice = await generateInvoice(amount)

      expect(invoice).toBeDefined()
      expect(invoice.amount).toBe(amount) // Should be exact amount when channels exist
      expect(invoice.description).toBeUndefined()
    })
  })

  describe('payInvoice', () => {
    it('should pay a valid invoice', async () => {
      const paymentRequest = 'lnbc1000n1testinvoice'

      const result = await payInvoice(paymentRequest)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.paymentHash).toBeDefined()
      expect(result.fee).toBeGreaterThan(0)
    })

    it('should reject invalid payment request', async () => {
      const invalidRequest = 'invalid'

      await expect(payInvoice(invalidRequest)).rejects.toThrow('Invalid payment request format')
    })
  })

  describe('openChannel', () => {
    it('should open a channel with valid parameters', async () => {
      const peerNodeId = '02'.repeat(33)
      const amount = 1000000
      const pushAmount = 50000

      const channel = await openChannel(peerNodeId, amount, pushAmount)

      expect(channel).toBeDefined()
      expect(channel.channelId).toBeDefined()
      expect(channel.capacity).toBe(amount)
      expect(channel.localBalance).toBe(amount - pushAmount)
      expect(channel.remoteBalance).toBe(pushAmount)
      expect(channel.status).toBe('pending')
      expect(channel.peerId).toBe(peerNodeId)
    })

    it('should reject invalid node ID', async () => {
      const invalidNodeId = 'invalid'
      const amount = 1000000

      await expect(openChannel(invalidNodeId, amount)).rejects.toThrow('Invalid peer node ID')
    })

    it('should reject channel capacity too small', async () => {
      const peerNodeId = '02'.repeat(33)
      const amount = 500 // Too small

      await expect(openChannel(peerNodeId, amount)).rejects.toThrow(
        'Channel capacity must be at least 20000 satoshis',
      )
    })

    it('should reject push amount exceeding capacity', async () => {
      const peerNodeId = '02'.repeat(33)
      const amount = 100000
      const pushAmount = 200000 // Exceeds capacity

      await expect(openChannel(peerNodeId, amount, pushAmount)).rejects.toThrow(
        'Push amount cannot exceed channel capacity',
      )
    })
  })

  describe('closeChannel', () => {
    it('should close a channel', async () => {
      const channelId = 'test-channel-id'

      const result = await closeChannel(channelId)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.txId).toBeDefined()
    })

    it('should force close a channel', async () => {
      const channelId = 'test-channel-id'

      const result = await closeChannel(channelId, true)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.txId).toBeDefined()
    })
  })

  describe('getWalletInfo', () => {
    it('should return wallet information', async () => {
      const wallet = await getWalletInfo()

      expect(wallet).toBeDefined()
      expect(wallet.nodeId).toBeDefined()
      expect(wallet.pubKey).toBeDefined()
      expect(Array.isArray(wallet.channels)).toBe(true)
      expect(typeof wallet.balance).toBe('number')
      expect(typeof wallet.pendingBalance).toBe('number')
    })
  })

  describe('getChannels', () => {
    it('should return channels array', async () => {
      const channels = await getChannels()

      expect(Array.isArray(channels)).toBe(true)
    })

    it('should return specific channel', async () => {
      const channelId = 'test-channel-id'
      const channels = await getChannels(channelId)

      expect(Array.isArray(channels)).toBe(true)
    })
  })

  describe('connectPeer', () => {
    it('should connect to valid peer', async () => {
      const nodeId = '02'.repeat(33)
      const host = '127.0.0.1'
      const port = 9735

      const result = await connectPeer(nodeId, host, port)

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })

    it('should reject invalid node ID', async () => {
      const invalidNodeId = 'invalid'
      const host = '127.0.0.1'

      await expect(connectPeer(invalidNodeId, host)).rejects.toThrow('Invalid node ID')
    })
  })

  describe('getNodeInfo', () => {
    it('should return node information', async () => {
      const nodeId = '02'.repeat(33)

      const result = await getNodeInfo(nodeId)

      expect(result).toBeDefined()
      expect(result.alias).toBeDefined()
      expect(result.color).toBeDefined()
    })

    it('should reject invalid node ID', async () => {
      const invalidNodeId = 'invalid'

      await expect(getNodeInfo(invalidNodeId)).rejects.toThrow('Invalid node ID')
    })
  })

  describe('decodeInvoice', () => {
    it('should decode valid invoice', async () => {
      const paymentRequest = 'lnbc1000n1testinvoice'

      const invoice = await decodeInvoice(paymentRequest)

      expect(invoice).toBeDefined()
      expect(invoice.amount).toBeDefined()
      expect(invoice.description).toBeDefined()
      expect(invoice.expiry).toBeDefined()
      expect(invoice.timestamp).toBeDefined()
    })

    it('should reject invalid payment request', async () => {
      const invalidRequest = 'invalid'

      await expect(decodeInvoice(invalidRequest)).rejects.toThrow('Invalid payment request format')
    })
  })
})
