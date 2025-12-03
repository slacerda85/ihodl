import { LightningClient } from '../client'
import { LightningConnection } from '@/core/models/lightning/client'

// Mock all dependencies at module level
jest.mock('../transport')
jest.mock('../base')
jest.mock('../invoice', () => ({
  encodeInvoice: jest.fn().mockReturnValue('lnbc1000n1p0x9z9pp5...'),
}))
jest.mock('../../key', () => ({
  deriveChildKey: jest.fn().mockReturnValue(new Uint8Array(64)),
  createPublicKey: jest.fn().mockReturnValue(new Uint8Array(33)),
}))
jest.mock('../../crypto/crypto', () => ({
  sha256: jest.fn().mockReturnValue(new Uint8Array(32)),
  randomBytes: jest.fn().mockReturnValue(new Uint8Array(32)),
}))
jest.mock('../../utils', () => ({
  uint8ArrayToHex: jest.fn().mockReturnValue('mockhash'),
}))
jest.mock('@/core/lib/network/socket', () => ({
  createLightningSocket: jest.fn().mockResolvedValue({}),
}))

describe('LightningClient', () => {
  let mockConnection: LightningConnection
  let mockMasterKey: Uint8Array
  let client: LightningClient

  beforeEach(() => {
    mockConnection = {} as LightningConnection
    mockMasterKey = new Uint8Array(64)
    client = new LightningClient(mockConnection, mockMasterKey, 'mainnet')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with provided parameters', () => {
      expect(client).toBeInstanceOf(LightningClient)
    })
  })

  describe('hasActiveChannels', () => {
    it('should return false (stub implementation)', async () => {
      const result = await client.hasActiveChannels()
      expect(result).toBe(false)
    })
  })

  describe('getBalance', () => {
    it('should return 0n (stub implementation)', async () => {
      const result = await client.getBalance()
      expect(result).toBe(0n)
    })
  })

  describe('close', () => {
    it('should close connection', async () => {
      mockConnection.destroy = jest.fn()
      ;(mockConnection as any).cleanup = jest.fn()

      await client.close()

      expect(mockConnection.destroy).toHaveBeenCalled()
    })
  })

  describe('private methods (tested indirectly)', () => {
    it('should calculate channel opening fee', () => {
      // Acessar método privado para teste
      const fee = (client as any).calculateChannelOpeningFee(100000n)
      expect(typeof fee).toBe('bigint')
      expect(fee).toBeGreaterThan(0n)
    })

    it.skip('should decode invoice basic', () => {
      const mockInvoice = 'lnbc1000n1p0x9z9pp5...'
      const result = (client as any).decodeInvoiceBasic(mockInvoice)

      expect(result).toHaveProperty('paymentHash')
      expect(result.paymentHash).toBeInstanceOf(Uint8Array)
    })
  })
})
