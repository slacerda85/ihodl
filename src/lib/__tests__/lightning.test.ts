import {
  validateChannelParams,
  generateChannelId,
  parseChannelId,
  calculateLightningFee,
  estimateCommitmentTxSize,
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
}))

describe('Lightning Network Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('validateChannelParams', () => {
    it('should validate valid channel parameters', () => {
      const params = {
        fundingAmount: 100000,
        pushAmount: 50000,
        dustLimit: 1000,
        channelReserve: 1000,
        htlcMinimum: 100,
        feeRate: 1000,
        toSelfDelay: 144,
        maxAcceptedHtlcs: 10,
      }

      const result = validateChannelParams(params)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate invalid funding amount', () => {
      const params = {
        fundingAmount: 500, // too low
      }

      const result = validateChannelParams(params)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Funding amount must be at least 1000 satoshis')
    })

    it('should validate push amount exceeding funding', () => {
      const params = {
        fundingAmount: 10000,
        pushAmount: 15000, // exceeds funding
      }

      const result = validateChannelParams(params)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Push amount cannot exceed funding amount')
    })

    it('should validate dust limit', () => {
      const params = {
        fundingAmount: 100000,
        dustLimit: 300, // below minimum
      }

      const result = validateChannelParams(params)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Dust limit must be at least 546 satoshis')
    })

    it('should validate to_self_delay range', () => {
      const params = {
        fundingAmount: 100000,
        toSelfDelay: 100, // too low
      }

      const result = validateChannelParams(params)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('to_self_delay must be between 144 and 2016 blocks')
    })

    it('should validate max_accepted_htlcs range', () => {
      const params = {
        fundingAmount: 100000,
        maxAcceptedHtlcs: 500, // too high
      }

      const result = validateChannelParams(params)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('max_accepted_htlcs must be between 1 and 483')
    })
  })

  describe('generateChannelId', () => {
    it('should generate channel ID from funding tx', () => {
      const fundingTxid = 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d'
      const fundingVout = 1

      const result = generateChannelId(fundingTxid, fundingVout)

      // Channel ID is funding_txid (reversed) + vout (4 bytes LE)
      const expectedTxidReversed =
        '8dd4f5fbd5e980fc02f35c6ce145935b11e284605bf599a13c6d415db55d07a1'
      const expected = expectedTxidReversed + '01000000'
      expect(result).toBe(expected)
    })
  })

  describe('parseChannelId', () => {
    it('should parse channel ID to funding info', () => {
      const channelId = '8dd4f5fbd5e980fc02f35c6ce145935b11e284605bf599a13c6d415db55d07a101000000'

      const result = parseChannelId(channelId)

      expect(result.fundingTxid).toBe(
        'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d',
      )
      expect(result.fundingVout).toBe(1)
    })

    it('should throw error for invalid channel ID length', () => {
      const invalidChannelId = 'short'

      expect(() => parseChannelId(invalidChannelId)).toThrow('Invalid channel ID length')
    })
  })

  describe('calculateLightningFee', () => {
    it('should calculate fee correctly', () => {
      const vbytes = 200
      const feeRate = 5
      const dustLimit = 546

      const result = calculateLightningFee(vbytes, feeRate, dustLimit)

      expect(result).toBe(1000) // 200 * 5
    })

    it('should respect dust limit', () => {
      const vbytes = 1
      const feeRate = 1
      const dustLimit = 1000

      const result = calculateLightningFee(vbytes, feeRate, dustLimit)

      expect(result).toBe(1000) // max of 1 and 1000
    })
  })

  describe('estimateCommitmentTxSize', () => {
    it('should estimate commitment transaction size', () => {
      const numHtlcs = 2
      const hasToLocal = true
      const hasToRemote = true

      const result = estimateCommitmentTxSize(numHtlcs, hasToLocal, hasToRemote)

      // Base size + to_local + to_remote + HTLCs + witness
      const expected = 4 + 4 + 41 + 1 + 31 + 31 + 2 * 43 + 1 + 1 + 73 + 33 + 2 * 73
      expect(result).toBe(Math.ceil(expected))
    })

    it('should estimate size without to_remote', () => {
      const numHtlcs = 0
      const hasToLocal = true
      const hasToRemote = false

      const result = estimateCommitmentTxSize(numHtlcs, hasToLocal, hasToRemote)

      const expected = 4 + 4 + 41 + 1 + 31 + 1 + 1 + 73 + 33
      expect(result).toBe(Math.ceil(expected))
    })
  })
})
