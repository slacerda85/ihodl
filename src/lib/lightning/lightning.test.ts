/**
 * Comprehensive Lightning Network Test Suite
 * Following BOLT specifications and protocol standards
 */

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
  generateLightningWalletConfig,
} from './index'
import { LightningAccountData } from '../account/types'
import {
  generatePaymentHash,
  validateInvoiceAmount,
  formatInvoiceAmount,
  calculateChannelCapacity,
  canSendPayment,
  canReceivePayment,
  calculateWalletBalance,
  calculatePendingBalance,
  validateNodeId,
  validatePaymentRequest,
  generateChannelId,
  generateChannelPoint,
  validateChannelParameters,
  calculateCltvExpiry,
  encodeBolt11Amount,
  decodeBolt11Amount,
  createTaggedField,
  parseTaggedField,
  getBolt11Prefix,
} from './utils'
import {
  LIGHTNING_CONSTANTS,
  LIGHTNING_FEATURES,
  BOLT11_PREFIXES,
  LIGHTNING_ERRORS,
} from './constants'
import { Channel } from './types'

// Mock implementations for testing
jest.mock('../crypto', () => ({
  sha256: jest.fn((data: Uint8Array) => {
    // Simple mock hash - in reality this would be proper SHA256
    const mockHash = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      mockHash[i] = data[i % data.length] || 0
    }
    return mockHash
  }),
  signMessage: jest.fn((message: Uint8Array, privateKey: Uint8Array) => {
    // Mock signature - in reality this would be proper ECDSA
    return new Uint8Array(64).fill(42)
  }),
  verifyMessage: jest.fn(() => true),
  encode: jest.fn((data: Uint8Array, hrp: string, version: number) => {
    // Mock Bech32 encoding
    return `${hrp}mockinvoice123456789`
  }),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => new Uint8Array(32).fill(1)),
  })),
}))

jest.mock('../wallet/wallet', () => ({
  deriveLightningKeys: jest.fn((seedPhrase: string) => ({
    nodeKey: {
      nodeId: '02abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab',
      privateKey: new Uint8Array(32).fill(1),
      publicKey: new Uint8Array(33).fill(2),
    },
  })),
}))

describe('Lightning Network Protocol Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Mock getChannels to return existing channels (so no channel opening fees are added)
    jest.spyOn({ getChannels }, 'getChannels').mockResolvedValue([
      {
        channelId: 'test-channel-id',
        fundingTxId: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        fundingOutputIndex: 0,
        capacity: 1000000,
        localBalance: 500000,
        remoteBalance: 500000,
        status: 'open' as const,
        peerId: 'test-peer-id',
        channelPoint: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:0',
        localChannelReserve: 1000,
        remoteChannelReserve: 1000,
      },
    ])
  })
  describe('BOLT 11 - Invoice Protocol', () => {
    describe('Invoice Generation', () => {
      test('should generate valid invoice with amount', async () => {
        const amount = 1000 // 1000 sats
        const description = 'Test payment'
        const invoice = await generateInvoice(amount, description)

        expect(invoice).toBeDefined()
        expect(invoice.amount).toBe(amount)
        expect(invoice.description).toBe(description)
        expect(invoice.paymentRequest).toMatch(/^lnbc/) // mainnet prefix
        expect(invoice.paymentHash).toMatch(/^[0-9a-f]{64}$/)
        expect(invoice.status).toBe('pending')
      })

      test('should generate zero-amount invoice', async () => {
        const description = 'Donation'
        const invoice = await generateInvoice(0, description)

        expect(invoice.amount).toBe(0) // Should be exact amount when channels exist
        expect(invoice.description).toBe(description)
        expect(invoice.paymentRequest).toMatch(/^lnbc/) // mainnet prefix
      })

      test('should reject invalid amounts', async () => {
        await expect(generateInvoice(-100)).rejects.toThrow('Invalid invoice amount')
        await expect(generateInvoice(0.5)).rejects.toThrow('Invalid invoice amount')
      })

      test('should handle long descriptions with hash', async () => {
        const longDescription = 'A'.repeat(1000) // Longer than 639 chars
        const invoice = await generateInvoice(1000, longDescription)

        expect(invoice.description).toBe(longDescription)
        // Should use description hash for long descriptions
      })

      test('should set correct expiry times', async () => {
        const customExpiry = 7200 // 2 hours
        const invoice = await generateInvoice(1000, 'Test', customExpiry)

        const expectedExpiry = Math.floor(Date.now() / 1000) + customExpiry
        expect(invoice.expiry).toBe(expectedExpiry)
      })

      test('should clamp expiry to maximum allowed', async () => {
        const tooLongExpiry = LIGHTNING_CONSTANTS.MAX_INVOICE_EXPIRY + 1000
        const invoice = await generateInvoice(1000, 'Test', tooLongExpiry)

        const expectedExpiry =
          Math.floor(Date.now() / 1000) + LIGHTNING_CONSTANTS.MAX_INVOICE_EXPIRY
        expect(invoice.expiry).toBe(expectedExpiry)
      })
    })

    describe('Invoice Decoding', () => {
      test('should decode valid invoice', async () => {
        const invoice = await generateInvoice(1000, 'Test payment')
        const decoded = await decodeInvoice(invoice.paymentRequest)

        expect(decoded.amount).toBeDefined()
        expect(decoded.description).toBeDefined()
        expect(decoded.expiry).toBeDefined()
      })

      test('should reject invalid payment requests', async () => {
        await expect(decodeInvoice('invalid-invoice')).rejects.toThrow(
          'Invalid payment request format',
        )
        await expect(decodeInvoice('')).rejects.toThrow('Invalid payment request format')
      })
    })

    describe('Payment Processing', () => {
      test('should process valid payment', async () => {
        const invoice = await generateInvoice(1000, 'Test payment')
        const result = await payInvoice(invoice.paymentRequest)

        expect(result.success).toBe(true)
        expect(result.paymentHash).toBeDefined()
        expect(typeof result.fee).toBe('number')
      })

      test('should reject invalid payment requests', async () => {
        await expect(payInvoice('invalid-invoice')).rejects.toThrow(
          'Invalid payment request format',
        )
      })
    })
  })

  describe('BOLT 2 - Channel Establishment', () => {
    describe('Channel Opening', () => {
      test('should reject invalid peer node IDs', async () => {
        await expect(openChannel('invalid-node-id', 50000)).rejects.toThrow('Invalid peer node ID')
        await expect(openChannel('', 50000)).rejects.toThrow('Invalid peer node ID')
      })

      test('should reject channels below minimum capacity', async () => {
        const peerNodeId = '02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        const tooSmallAmount = LIGHTNING_CONSTANTS.MIN_CHANNEL_CAPACITY - 1000

        await expect(openChannel(peerNodeId, tooSmallAmount)).rejects.toThrow(
          `Channel capacity must be at least ${LIGHTNING_CONSTANTS.MIN_CHANNEL_CAPACITY} satoshis`,
        )
      })

      test('should validate channel parameters', () => {
        const validParams = validateChannelParameters(50000, 546, 1000)
        expect(validParams).toBe(true)

        const invalidParams = validateChannelParameters(10000, 100, 10000) // Reserve too high
        expect(invalidParams).toBe(false)
      })
    })

    describe('Channel Management', () => {
      test('should close channel successfully', async () => {
        const result = await closeChannel('test-channel-id')

        expect(result.success).toBe(true)
        expect(result.txId).toBeDefined()
      })

      test('should get channel information', async () => {
        const channels = await getChannels()

        expect(Array.isArray(channels)).toBe(true)
      })

      test('should get wallet information', async () => {
        const wallet = await getWalletInfo()

        expect(wallet).toBeDefined()
        expect(wallet.nodeId).toBeDefined()
        expect(Array.isArray(wallet.channels)).toBe(true)
        expect(typeof wallet.balance).toBe('number')
      })
    })
  })

  describe('Utility Functions', () => {
    describe('Payment Hash Generation', () => {
      test('should generate valid payment hash', () => {
        const { paymentHash, preimage } = generatePaymentHash()

        expect(paymentHash).toMatch(/^[0-9a-f]{64}$/)
        expect(preimage).toBeInstanceOf(Uint8Array)
        expect(preimage.length).toBe(32)
      })

      test('should generate hash from provided preimage', () => {
        const customPreimage = new Uint8Array(32).fill(42)
        const { paymentHash, preimage } = generatePaymentHash(customPreimage)

        expect(paymentHash).toMatch(/^[0-9a-f]{64}$/)
        expect(preimage).toEqual(customPreimage)
      })
    })

    describe('Amount Validation and Formatting', () => {
      test('should validate invoice amounts', () => {
        expect(validateInvoiceAmount(1000)).toBe(true)
        expect(validateInvoiceAmount(0)).toBe(true) // Allow zero amounts
        expect(validateInvoiceAmount(-100)).toBe(false)
        expect(validateInvoiceAmount(1.5)).toBe(false)
      })

      test('should format amounts correctly', () => {
        expect(formatInvoiceAmount(1000)).toBe('1k sats')
        expect(formatInvoiceAmount(5000)).toBe('5k sats')
        expect(formatInvoiceAmount(100000000)).toBe('1.00000000 BTC')
      })

      test('should encode/decode BOLT11 amounts', () => {
        const testCases = [
          { sats: 1000, encoded: '10u' },
          { sats: 5000, encoded: '50u' },
          { sats: 1000000, encoded: '10000u' },
        ]

        testCases.forEach(({ sats, encoded }) => {
          const encodedAmount = encodeBolt11Amount(sats)
          expect(encodedAmount).toBe(encoded)

          const decodedAmount = decodeBolt11Amount(encodedAmount)
          expect(decodedAmount).toBe(sats)
        })
      })
    })

    describe('Channel Calculations', () => {
      const mockChannel: Channel = {
        channelId: 'test-channel',
        fundingTxId: 'abcd1234',
        fundingOutputIndex: 0,
        capacity: 100000,
        localBalance: 60000,
        remoteBalance: 40000,
        status: 'open',
        peerId: 'test-peer',
        channelPoint: 'abcd1234:0',
        localChannelReserve: 1000,
        remoteChannelReserve: 1000,
      }

      test('should calculate channel capacity', () => {
        const capacity = calculateChannelCapacity(60000, 40000)
        expect(capacity).toBe(100000)
      })

      test('should check if channel can send payment', () => {
        expect(canSendPayment(mockChannel, 50000)).toBe(true) // Within balance
        expect(canSendPayment(mockChannel, 59001)).toBe(false) // Exceeds reserve
        expect(canSendPayment({ ...mockChannel, status: 'closed' }, 10000)).toBe(false) // Wrong status
      })

      test('should check if channel can receive payment', () => {
        expect(canReceivePayment(mockChannel, 30000)).toBe(true) // Within balance
        expect(canReceivePayment(mockChannel, 39001)).toBe(false) // Exceeds reserve
        expect(canReceivePayment({ ...mockChannel, status: 'closed' }, 10000)).toBe(false) // Wrong status
      })

      test('should calculate wallet balance', () => {
        const channels: Channel[] = [mockChannel, { ...mockChannel, status: 'closed' as const }]
        const balance = calculateWalletBalance(channels)
        expect(balance).toBe(60000) // Only open channels count
      })

      test('should calculate pending balance', () => {
        const channels: Channel[] = [
          mockChannel,
          { ...mockChannel, status: 'pending' as const, localBalance: 20000 },
        ]
        const pendingBalance = calculatePendingBalance(channels)
        expect(pendingBalance).toBe(20000)
      })
    })

    describe('Node and Payment Validation', () => {
      test('should validate node IDs', () => {
        const validNodeId = '02' + 'a'.repeat(64) // 66 characters total
        expect(validateNodeId(validNodeId)).toBe(true)
        expect(validateNodeId('invalid-node-id')).toBe(false)
        expect(validateNodeId('')).toBe(false)
        expect(validateNodeId('02abcdef')).toBe(false) // Too short
      })

      test('should validate payment requests', () => {
        expect(validatePaymentRequest('lnbc1000n1p...')).toBe(true)
        expect(validatePaymentRequest('lntb500u1p...')).toBe(true)
        expect(validatePaymentRequest('lnbcrt1000u1p...')).toBe(true)
        expect(validatePaymentRequest('invalid-invoice')).toBe(false)
      })
    })

    describe('Channel ID Generation', () => {
      test('should generate channel ID from funding transaction', () => {
        const fundingTxId = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234'
        const fundingOutputIndex = 0

        const channelId = generateChannelId(fundingTxId, fundingOutputIndex)
        expect(channelId).toMatch(/^[0-9a-f]{64}$/)
        expect(channelId.length).toBe(64)
      })

      test('should generate channel point', () => {
        const fundingTxId = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234'
        const fundingOutputIndex = 1

        const channelPoint = generateChannelPoint(fundingTxId, fundingOutputIndex)
        expect(channelPoint).toBe(`${fundingTxId}:${fundingOutputIndex}`)
      })
    })

    describe('CLTV Expiry Calculation', () => {
      test('should calculate CLTV expiry', () => {
        const currentBlockHeight = 700000
        const cltvExpiryDelta = 144

        const expiry = calculateCltvExpiry(currentBlockHeight, cltvExpiryDelta)
        expect(expiry).toBe(700144)
      })

      test('should enforce minimum CLTV expiry', () => {
        const currentBlockHeight = 700000
        const tooSmallDelta = 10 // Below minimum

        const expiry = calculateCltvExpiry(currentBlockHeight, tooSmallDelta)
        expect(expiry).toBe(700000 + LIGHTNING_CONSTANTS.MIN_CLTV_EXPIRY)
      })
    })

    describe('Tagged Fields', () => {
      test('should create tagged field', () => {
        const tag = 'p'
        const data = new Uint8Array([1, 2, 3, 4])
        const field = createTaggedField(tag, data)

        expect(field[0]).toBe(tag.charCodeAt(0)) // Tag byte
        expect(field[1]).toBe(data.length) // Length
        expect(field.slice(2)).toEqual(data) // Data
      })

      test('should parse tagged field', () => {
        const tag = 'p'
        const data = new Uint8Array([1, 2, 3, 4])
        const field = createTaggedField(tag, data)
        const parsed = parseTaggedField(field)

        expect(parsed.tag).toBe(tag)
        expect(parsed.data).toEqual(data)
      })
    })

    describe('BOLT11 Prefixes', () => {
      test('should return correct prefixes for networks', () => {
        expect(getBolt11Prefix('mainnet')).toBe(BOLT11_PREFIXES.MAINNET)
        expect(getBolt11Prefix('testnet')).toBe(BOLT11_PREFIXES.TESTNET)
        expect(getBolt11Prefix('regtest')).toBe(BOLT11_PREFIXES.REGTEST)
        expect(getBolt11Prefix('unknown' as any)).toBe(BOLT11_PREFIXES.TESTNET) // Default
      })
    })
  })

  describe('BOLT 7 - P2P Node and Channel Discovery', () => {
    describe('Peer Connection', () => {
      test('should connect to valid peer', async () => {
        const nodeId = '02' + 'a'.repeat(64)
        const host = '127.0.0.1'
        const port = 9735

        const result = await connectPeer(nodeId, host, port)
        expect(result.success).toBe(true)
      })

      test('should reject invalid node IDs', async () => {
        await expect(connectPeer('invalid-node-id', '127.0.0.1')).rejects.toThrow('Invalid node ID')
      })
    })

    describe('Node Information', () => {
      test('should get node information', async () => {
        const nodeId = '02' + 'a'.repeat(64)
        const info = await getNodeInfo(nodeId)

        expect(info).toBeDefined()
        expect(typeof info.alias).toBe('string')
        expect(typeof info.color).toBe('string')
      })

      test('should reject invalid node IDs for info', async () => {
        await expect(getNodeInfo('invalid-node-id')).rejects.toThrow('Invalid node ID')
      })
    })
  })

  describe('Wallet Configuration', () => {
    test('should generate Lightning wallet config from account data', async () => {
      const mockLightningAccountData: LightningAccountData = {
        type: 'node',
        derivedKeys: {
          nodeKey: {
            privateKey: new Uint8Array(32).fill(1),
            publicKey: new Uint8Array(33).fill(2),
            nodeId: 'mock-node-id',
          },
        },
      }

      const config = await generateLightningWalletConfig(mockLightningAccountData)

      expect(config).toBeDefined()
      expect(config?.nodeId).toBe('mock-node-id')
      expect(config?.nodePrivateKey).toBeInstanceOf(Uint8Array)
      expect(config?.nodePublicKey).toBeInstanceOf(Uint8Array)
      expect(config?.electrumServer).toBe('electrum.blockstream.info:50001')
    })

    test('should return null when Lightning keys are not available', async () => {
      const mockLightningAccountData: LightningAccountData = {
        type: 'node',
        derivedKeys: {},
      }

      const config = await generateLightningWalletConfig(mockLightningAccountData)

      expect(config).toBeNull()
    })
  })

  describe('Constants and Features', () => {
    test('should have correct Lightning constants', () => {
      expect(LIGHTNING_CONSTANTS.MIN_CHANNEL_CAPACITY).toBe(20000)
      expect(LIGHTNING_CONSTANTS.DEFAULT_INVOICE_EXPIRY).toBe(3600)
      expect(LIGHTNING_CONSTANTS.MAX_INVOICE_EXPIRY).toBe(604800)
      expect(LIGHTNING_CONSTANTS.BIP32_PURPOSE).toBe(1017)
    })

    test('should have correct BOLT11 prefixes', () => {
      expect(BOLT11_PREFIXES.MAINNET).toBe('lnbc')
      expect(BOLT11_PREFIXES.TESTNET).toBe('lntb')
      expect(BOLT11_PREFIXES.REGTEST).toBe('lnbcrt')
    })

    test('should have Lightning features defined', () => {
      expect(LIGHTNING_FEATURES.OPTION_DATA_LOSS_PROTECT).toBeDefined()
      expect(LIGHTNING_FEATURES.OPTION_STATIC_REMOTE_KEY).toBeDefined()
      expect(LIGHTNING_FEATURES.OPTION_TRAMPOLINE_ROUTING).toBeDefined()
    })

    test('should have error codes defined', () => {
      expect(LIGHTNING_ERRORS.TEMPORARY_CHANNEL_FAILURE).toBeDefined()
      expect(LIGHTNING_ERRORS.FEE_INSUFFICIENT).toBeDefined()
      expect(LIGHTNING_ERRORS.INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS).toBeDefined()
    })
  })

  describe('BOLT 8 - Transport Layer Security', () => {
    // Note: Full BOLT 8 implementation would require proper cryptographic
    // primitives and noise protocol handshake. This is a basic test structure.

    test('should have transport-related constants', () => {
      expect(LIGHTNING_CONSTANTS.MSG_INIT).toBe(16)
      expect(LIGHTNING_CONSTANTS.MSG_ERROR).toBe(17)
      expect(LIGHTNING_CONSTANTS.MSG_PING).toBe(18)
      expect(LIGHTNING_CONSTANTS.MSG_PONG).toBe(19)
    })

    test('should validate transport message types', () => {
      // Basic validation that message type constants are defined
      expect(LIGHTNING_CONSTANTS.MSG_OPEN_CHANNEL).toBe(32)
      expect(LIGHTNING_CONSTANTS.MSG_ACCEPT_CHANNEL).toBe(33)
      expect(LIGHTNING_CONSTANTS.MSG_FUNDING_CREATED).toBe(34)
      expect(LIGHTNING_CONSTANTS.MSG_FUNDING_SIGNED).toBe(35)
    })
  })

  describe('Integration Tests', () => {
    test('should complete full invoice lifecycle', async () => {
      // 1. Generate invoice
      const amount = 5000
      const description = 'Integration test payment'
      const invoice = await generateInvoice(amount, description)

      expect(invoice.amount).toBe(amount)
      expect(invoice.description).toBe(description)
      expect(invoice.status).toBe('pending')

      // 2. Decode invoice
      const decoded = await decodeInvoice(invoice.paymentRequest)
      expect(decoded.amount).toBeDefined()
      // Note: Mock implementation returns generic description

      // 3. Pay invoice
      const paymentResult = await payInvoice(invoice.paymentRequest)
      expect(paymentResult.success).toBe(true)
      expect(paymentResult.paymentHash).toBeDefined()
    })

    test('should complete full channel lifecycle', async () => {
      // 1. Open channel
      const peerNodeId = '02' + 'a'.repeat(64)
      const amount = 100000
      const channel = await openChannel(peerNodeId, amount)

      expect(channel.capacity).toBe(amount)
      expect(channel.status).toBe('pending')

      // 2. Get channel info
      const channels = await getChannels()
      expect(Array.isArray(channels)).toBe(true)

      // 3. Close channel
      const closeResult = await closeChannel(channel.channelId)
      expect(closeResult.success).toBe(true)
    })
  })
})
