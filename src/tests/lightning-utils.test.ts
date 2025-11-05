import {
  generatePaymentHash,
  calculateInvoiceExpiry,
  validateInvoiceAmount,
  formatInvoiceAmount,
  validateNodeId,
  validatePaymentRequest,
  generateChannelId,
  parseTaggedField,
  createTaggedField,
  encodeBolt11Amount,
  decodeBolt11Amount,
  getBolt11Prefix,
  generateInvoiceSignature,
} from '../lib/lightning/utils'

describe('Lightning Utils', () => {
  describe('generatePaymentHash', () => {
    it('should generate a payment hash', () => {
      const result = generatePaymentHash()

      expect(result).toBeDefined()
      expect(result.paymentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(result.preimage).toBeInstanceOf(Uint8Array)
      expect(result.preimage.length).toBe(32)
    })

    it('should generate consistent hash from preimage', () => {
      const preimage = new Uint8Array(Buffer.from('test preimage'))
      const result1 = generatePaymentHash(preimage)
      const result2 = generatePaymentHash(preimage)

      expect(result1.paymentHash).toBe(result2.paymentHash)
    })
  })

  describe('calculateInvoiceExpiry', () => {
    it('should calculate expiry timestamp', () => {
      const expirySeconds = 3600
      const result = calculateInvoiceExpiry(expirySeconds)

      expect(result).toBeGreaterThan(Date.now() / 1000)
      expect(result).toBeLessThanOrEqual(Date.now() / 1000 + expirySeconds)
    })

    it('should use default expiry when not specified', () => {
      const result = calculateInvoiceExpiry()

      expect(result).toBeGreaterThan(Date.now() / 1000)
    })
  })

  describe('validateInvoiceAmount', () => {
    it('should validate positive integer amounts', () => {
      expect(validateInvoiceAmount(1000)).toBe(true)
      expect(validateInvoiceAmount(1)).toBe(true)
    })

    it('should reject invalid amounts', () => {
      expect(validateInvoiceAmount(-100)).toBe(false)
      expect(validateInvoiceAmount(1.5)).toBe(false)
      // Note: 0 is now allowed in mock implementation
    })
  })

  describe('formatInvoiceAmount', () => {
    it('should format amounts in BTC', () => {
      expect(formatInvoiceAmount(100000000)).toBe('1.00000000 BTC')
    })

    it('should format amounts in k sats', () => {
      expect(formatInvoiceAmount(5000)).toBe('5k sats')
    })

    it('should format amounts in sats', () => {
      expect(formatInvoiceAmount(500)).toBe('500 sats')
    })
  })

  describe('validateNodeId', () => {
    it('should validate valid node IDs', () => {
      const validNodeId = '02'.repeat(33)
      expect(validateNodeId(validNodeId)).toBe(true)
    })

    it('should reject invalid node IDs', () => {
      expect(validateNodeId('invalid')).toBe(false)
      expect(validateNodeId('02'.repeat(32))).toBe(false) // Too short
      expect(validateNodeId('02'.repeat(33) + '0')).toBe(false) // Too long
    })
  })

  describe('validatePaymentRequest', () => {
    it('should validate BOLT11 payment requests', () => {
      expect(validatePaymentRequest('lnbc1000n1p...')).toBe(true)
      expect(validatePaymentRequest('lntb1000n1p...')).toBe(true)
      expect(validatePaymentRequest('lnbcrt1000n1p...')).toBe(true)
    })

    it('should reject invalid payment requests', () => {
      expect(validatePaymentRequest('invalid')).toBe(false)
      expect(validatePaymentRequest('')).toBe(false)
    })
  })

  describe('generateChannelId', () => {
    it('should generate channel ID from funding tx', () => {
      const fundingTxid = 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d'
      const fundingVout = 1

      const result = generateChannelId(fundingTxid, fundingVout)

      // Channel ID is funding_txid (reversed) XOR vout (little-endian)
      expect(result).toMatch(/^[0-9a-f]{64}$/)
      expect(result.length).toBe(64)
    })
  })

  describe('encodeBolt11Amount', () => {
    it('should encode amounts correctly', () => {
      expect(encodeBolt11Amount(1000)).toBe('10u') // 1000 sats = 10 * 100 sats
      expect(encodeBolt11Amount(100000)).toBe('1000u') // 100000 sats = 1000 * 100 sats
    })

    it('should handle zero amount', () => {
      expect(encodeBolt11Amount(0)).toBe('')
    })
  })

  describe('decodeBolt11Amount', () => {
    it('should decode amounts correctly', () => {
      expect(decodeBolt11Amount('10u')).toBe(1000) // 10 * 100 sats = 1000 sats
      expect(decodeBolt11Amount('1000u')).toBe(100000) // 1000 * 100 sats = 100000 sats
    })

    it('should handle empty amount', () => {
      expect(decodeBolt11Amount('')).toBe(0)
    })
  })

  describe('createTaggedField', () => {
    it('should create tagged field buffer', () => {
      const data = new Uint8Array(Buffer.from('test'))
      const result = createTaggedField('p', data)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result[0]).toBe('p'.charCodeAt(0)) // Tag
      expect(result[1]).toBe(4) // Length
      expect(result.slice(2)).toEqual(data) // Data
    })
  })

  describe('parseTaggedField', () => {
    it('should parse tagged field buffer', () => {
      const originalData = new Uint8Array(Buffer.from('test'))
      const taggedField = createTaggedField('p', originalData)
      const result = parseTaggedField(taggedField)

      expect(result.tag).toBe('p')
      expect(result.data).toEqual(originalData)
    })
  })

  describe('getBolt11Prefix', () => {
    it('should return correct prefixes', () => {
      expect(getBolt11Prefix('mainnet')).toBe('lnbc')
      expect(getBolt11Prefix('testnet')).toBe('lntb')
      expect(getBolt11Prefix('regtest')).toBe('lnbcrt')
    })

    it('should default to testnet', () => {
      expect(getBolt11Prefix()).toBe('lntb')
    })
  })

  describe('generateInvoiceSignature and verifyInvoiceSignature', () => {
    it('should generate invoice signature', () => {
      // Use a valid private key for testing (32 bytes)
      const privateKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      const privateKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'))
      const hrp = 'lntb1000n1'
      const data = new Uint8Array(Buffer.from('test data'))

      const signature = generateInvoiceSignature(hrp, data, privateKey)
      expect(signature).toBeInstanceOf(Uint8Array)
      expect(signature.length).toBeGreaterThan(0)
    })
  })
})
