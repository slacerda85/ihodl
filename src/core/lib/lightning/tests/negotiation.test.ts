import {
  encodeBigSize,
  decodeBigSize,
  encodeTlvRecord,
  decodeTlvStream,
  encodeTlvStream,
  buildMerkleTree,
  getMerkleRoot,
  encodeBolt12,
  decodeBolt12,
  validateOffer,
  getOfferExpiryStatus,
  validateInvoiceRequest,
  validateInvoice,
  getInvoiceExpiryStatus,
  extractTlvRange,
  hasUnknownEvenFeatures,
  getPaymentFlowType,
} from '../negotiation'
import {
  Offer,
  InvoiceRequest,
  Invoice,
  // Bolt12TlvRecord,
  Bolt12TlvStream,
  PaymentFlowType,
  // OfferTlvType,
  // InvoiceRequestTlvType,
  // InvoiceTlvType,
} from '@/core/models/lightning/negotiation'
import { Sha256 } from '@/core/models/lightning/base'
// import { sha256 } from '../../crypto'

// Helper function to create Uint8Array from hex string
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

// Helper function to create Sha256 from hex string
function hexToSha256(hex: string): Sha256 {
  return hexToUint8Array(hex) as Sha256
}

describe('BOLT 12 Negotiation Protocol', () => {
  beforeEach(() => {
    // removed setup mocking
  })

  describe('BigSize Encoding/Decoding', () => {
    describe('encodeBigSize', () => {
      it('should encode values 0-252 as single byte', () => {
        expect(encodeBigSize(0n)).toEqual(new Uint8Array([0]))
        expect(encodeBigSize(252n)).toEqual(new Uint8Array([252]))
      })

      it('should encode values 253-65535 as 3 bytes with 0xfd prefix', () => {
        expect(encodeBigSize(253n)).toEqual(new Uint8Array([0xfd, 0x00, 0xfd]))
        expect(encodeBigSize(65535n)).toEqual(new Uint8Array([0xfd, 0xff, 0xff]))
      })

      it('should encode values 65536-4294967295 as 5 bytes with 0xfe prefix', () => {
        expect(encodeBigSize(65536n)).toEqual(new Uint8Array([0xfe, 0x00, 0x01, 0x00, 0x00]))
        expect(encodeBigSize(4294967295n)).toEqual(new Uint8Array([0xfe, 0xff, 0xff, 0xff, 0xff]))
      })

      it('should encode values 4294967296+ as 9 bytes with 0xff prefix', () => {
        const largeValue = 4294967296n
        const expected = new Uint8Array(9)
        expected[0] = 0xff
        expected[1] = 0x00
        expected[2] = 0x00
        expected[3] = 0x00
        expected[4] = 0x01 // bit 32 set
        expected[5] = 0x00
        expected[6] = 0x00
        expected[7] = 0x00
        expected[8] = 0x00 // LSB
        expect(encodeBigSize(largeValue)).toEqual(expected)
      })

      it('should throw error for negative values', () => {
        expect(() => encodeBigSize(-1n)).toThrow('BigSize value must be non-negative')
      })
    })

    describe('decodeBigSize', () => {
      it('should decode single byte values (0-252)', () => {
        expect(decodeBigSize(new Uint8Array([0]))).toEqual([0n, 1])
        expect(decodeBigSize(new Uint8Array([252]))).toEqual([252n, 1])
      })

      it('should decode 3-byte values with 0xfd prefix', () => {
        expect(decodeBigSize(new Uint8Array([0xfd, 0x00, 0xfd]))).toEqual([253n, 3])
        expect(decodeBigSize(new Uint8Array([0xfd, 0xff, 0xff]))).toEqual([65535n, 3])
      })

      it('should decode 5-byte values with 0xfe prefix', () => {
        expect(decodeBigSize(new Uint8Array([0xfe, 0x00, 0x01, 0x00, 0x00]))).toEqual([65536n, 5])
        expect(decodeBigSize(new Uint8Array([0xfe, 0xff, 0xff, 0xff, 0xff]))).toEqual([
          4294967295n,
          5,
        ])
      })

      it('should decode 9-byte values with 0xff prefix', () => {
        const buffer = new Uint8Array(9)
        buffer[0] = 0xff
        buffer[4] = 0x01 // bit 32 set for value 4294967296n
        expect(decodeBigSize(buffer)).toEqual([4294967296n, 9])
      })

      it('should handle offset parameter', () => {
        const buffer = new Uint8Array([0x00, 0xfd, 0x00, 0xfd])
        expect(decodeBigSize(buffer, 1)).toEqual([253n, 3])
      })

      it('should throw error for buffer too short', () => {
        expect(() => decodeBigSize(new Uint8Array([]))).toThrow('Buffer too short for BigSize')
        expect(() => decodeBigSize(new Uint8Array([0xfd, 0x00]))).toThrow(
          'Buffer too short for 2-byte BigSize',
        )
      })
    })
  })

  describe('TLV Encoding/Decoding', () => {
    describe('encodeTlvRecord', () => {
      it('should encode type, length, and value correctly', () => {
        const result = encodeTlvRecord(1n, new Uint8Array([0x03, 0x04, 0x05]))

        // Expected: type(1) + length(3) + value(3,4,5) = [1, 3, 3, 4, 5]
        expect(result).toEqual(new Uint8Array([0x01, 0x03, 0x03, 0x04, 0x05]))
      })
    })

    describe('decodeTlvStream', () => {
      it('should decode multiple TLV records', () => {
        const buffer = new Uint8Array([
          0x01, // type 1
          0x02, // length 2
          0xaa,
          0xbb, // value
          0x02, // type 2
          0x01, // length 1
          0xcc, // value
        ])

        const result = decodeTlvStream(buffer)

        expect(result).toEqual([
          { type: 1n, length: 2n, value: new Uint8Array([0xaa, 0xbb]) },
          { type: 2n, length: 1n, value: new Uint8Array([0xcc]) },
        ])
      })

      it('should handle empty buffer', () => {
        expect(decodeTlvStream(new Uint8Array([]))).toEqual([])
      })

      it('should throw error for truncated TLV record', () => {
        const buffer = new Uint8Array([0x01, 0x02, 0xaa]) // Missing second byte of value
        expect(() => decodeTlvStream(buffer)).toThrow('TLV value extends beyond buffer')
      })
    })

    describe('encodeTlvStream', () => {
      it('should encode and sort TLV records by type', () => {
        const records: Bolt12TlvStream = [
          { type: 2n, length: 1n, value: new Uint8Array([0xbb]) },
          { type: 1n, length: 2n, value: new Uint8Array([0xaa, 0xbb]) },
        ]

        const result = encodeTlvStream(records)

        // Should be sorted by type: type 1 first, then type 2
        // Expected: [1, 2, aa, bb, 2, 1, bb]
        expect(result).toEqual(new Uint8Array([0x01, 0x02, 0xaa, 0xbb, 0x02, 0x01, 0xbb]))
      })

      it('should handle empty stream', () => {
        expect(encodeTlvStream([])).toEqual(new Uint8Array([]))
      })
    })
  })

  describe('Merkle Tree Construction', () => {
    describe('buildMerkleTree', () => {
      it('should build Merkle tree from TLV stream', () => {
        const tlvStream: Bolt12TlvStream = [
          { type: 0n, length: 4n, value: new Uint8Array([0x11, 0x22, 0x33, 0x44]) },
          { type: 1n, length: 2n, value: new Uint8Array([0xaa, 0xbb]) },
        ]

        const result = buildMerkleTree(tlvStream)

        expect(result).toHaveProperty('hash')
        expect(result.hash).toBeInstanceOf(Uint8Array)
        expect(result.hash.length).toBe(32)
      })

      it('should throw error for empty TLV stream', () => {
        expect(() => buildMerkleTree([])).toThrow('Cannot build Merkle tree from empty TLV stream')
      })
    })

    describe('getMerkleRoot', () => {
      it('should return the hash from Merkle tree root', () => {
        const mockTree: any = {
          hash: hexToSha256('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        }

        const result = getMerkleRoot(mockTree)

        expect(result).toEqual(mockTree.hash)
      })
    })
  })

  describe('Bech32 Encoding/Decoding', () => {
    describe('encodeBolt12', () => {
      it('should encode TLV stream to bech32 string', () => {
        const tlvStream: Bolt12TlvStream = [
          { type: 1n, length: 2n, value: new Uint8Array([0xaa, 0xbb]) },
        ]

        const result = encodeBolt12('lno', tlvStream)

        // Just check that it returns a string starting with the HRP
        expect(result).toMatch(/^lno1/)
        expect(typeof result).toBe('string')
      })
    })

    describe('decodeBolt12', () => {
      it('should decode bech32 string to HRP and TLV stream', () => {
        // Create a valid bech32 string by encoding first
        const tlvStream: Bolt12TlvStream = [
          { type: 1n, length: 2n, value: new Uint8Array([0xaa, 0xbb]) },
        ]
        const encoded = encodeBolt12('lno', tlvStream)

        const result = decodeBolt12(encoded)

        expect(result).toEqual({
          hrp: 'lno',
          tlvStream: expect.any(Array),
        })
        expect(result.tlvStream.length).toBe(1)
        expect(result.tlvStream[0].type).toBe(1n)
        expect(result.tlvStream[0].length).toBe(2n)
        expect(result.tlvStream[0].value).toEqual(new Uint8Array([0xaa, 0xbb]))
      })

      it('should handle strings with + separators', () => {
        // Create a valid bech32 string and add + separators
        const tlvStream: Bolt12TlvStream = [
          { type: 1n, length: 2n, value: new Uint8Array([0xaa, 0xbb]) },
        ]
        const encoded = encodeBolt12('lno', tlvStream)
        const withSeparators = encoded.slice(0, 10) + '+\n  ' + encoded.slice(10)

        const result = decodeBolt12(withSeparators)

        expect(result.hrp).toBe('lno')
        expect(result.tlvStream.length).toBe(1)
      })

      it('should throw error for invalid bech32 string', () => {
        expect(() => decodeBolt12('invalid')).toThrow('Invalid BOLT 12 string: missing separator')
        expect(() => decodeBolt12('lno1invalid@')).toThrow('Invalid bech32 character')
      })
    })
  })

  describe('Offer Validation', () => {
    describe('validateOffer', () => {
      it('should validate a minimal valid offer', () => {
        const offer: Offer = {
          description: 'Test payment',
          issuerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
        }

        const result = validateOffer(offer)

        expect(result.isValid).toBe(true)
        expect(result.errors).toEqual([])
      })

      it('should require either issuerId or paths', () => {
        const offer: Offer = {
          description: 'Test payment',
        }

        const result = validateOffer(offer)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Either offer_issuer_id or offer_paths must be set')
      })

      it('should require description when amount is set', () => {
        const offer: Offer = {
          amount: 1000n,
          issuerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
        }

        const result = validateOffer(offer)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('offer_description required when offer_amount is set')
      })

      it('should require amount when currency is set', () => {
        const offer: Offer = {
          currency: 'USD',
          description: 'Test payment',
          issuerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
        }

        const result = validateOffer(offer)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('offer_currency requires offer_amount to be set')
      })

      it('should validate paths have at least one hop', () => {
        const offer: Offer = {
          description: 'Test payment',
          paths: [{ numHops: 0, blindedHops: [] }] as any,
        }

        const result = validateOffer(offer)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Blinded path must have at least one hop (num_hops > 0)')
      })

      it('should reject quantity_max of 0', () => {
        const offer: Offer = {
          description: 'Test payment',
          issuerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          quantityMax: 0n,
        }

        const result = validateOffer(offer)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('offer_quantity_max should not be explicitly set to 0')
      })
    })

    describe('getOfferExpiryStatus', () => {
      it('should return not expired for offer without expiry', () => {
        const offer: Offer = { description: 'Test' }

        const result = getOfferExpiryStatus(offer)

        expect(result.isExpired).toBe(false)
        expect(result.secondsUntilExpiry).toBe(Infinity)
        expect(result.expiryTimestamp).toBe(Infinity)
      })

      it('should calculate expiry status correctly', () => {
        const currentTime = 1000000000
        const expiryTime = 1000000100n // 100 seconds from now
        const offer: Offer = {
          description: 'Test',
          absoluteExpiry: expiryTime,
        }

        const result = getOfferExpiryStatus(offer, currentTime)

        expect(result.isExpired).toBe(false)
        expect(result.secondsUntilExpiry).toBe(100)
        expect(result.expiryTimestamp).toBe(Number(expiryTime))
      })

      it('should detect expired offers', () => {
        const currentTime = 1000000100
        const expiryTime = 1000000000n // 100 seconds ago
        const offer: Offer = {
          description: 'Test',
          absoluteExpiry: expiryTime,
        }

        const result = getOfferExpiryStatus(offer, currentTime)

        expect(result.isExpired).toBe(true)
        expect(result.secondsUntilExpiry).toBe(0)
        expect(result.expiryTimestamp).toBe(Number(expiryTime))
      })
    })
  })

  describe('Invoice Request Validation', () => {
    describe('validateInvoiceRequest', () => {
      it('should validate a basic invoice request responding to offer', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01, 0x02, 0x03]),
          invreqPayerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          issuerId: hexToUint8Array(
            '0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          description: 'Test payment',
          invreqAmount: 1000n,
        }

        const result = validateInvoiceRequest(invreq)

        expect(result.isValid).toBe(true)
        expect(result.errors).toEqual([])
      })

      it('should require invreq_metadata', () => {
        const invreq: Omit<InvoiceRequest, 'invreqMetadata'> = {
          invreqPayerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          issuerId: hexToUint8Array(
            '0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          description: 'Test payment',
        }

        const result = validateInvoiceRequest(invreq as InvoiceRequest)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invreq_metadata is required')
      })

      it('should require invreq_payer_id', () => {
        const invreq: Omit<InvoiceRequest, 'invreqPayerId'> = {
          invreqMetadata: new Uint8Array([0x01, 0x02, 0x03]),
          issuerId: hexToUint8Array(
            '0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          description: 'Test payment',
        }

        const result = validateInvoiceRequest(invreq as InvoiceRequest)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invreq_payer_id is required')
      })

      it('should validate non-offer invoice request', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01, 0x02, 0x03]),
          invreqPayerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          description: 'Refund payment',
          invreqAmount: 1000n,
          invreqPaths: [{ numHops: 1, blindedHops: [] }] as any,
        }

        const result = validateInvoiceRequest(invreq)

        expect(result.isValid).toBe(true)
        expect(result.errors).toEqual([])
      })

      it('should require description for non-offer requests', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01, 0x02, 0x03]),
          invreqPayerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          invreqAmount: 1000n,
        }

        const result = validateInvoiceRequest(invreq)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('offer_description required for non-offer invoice requests')
      })

      it('should require amount for non-offer requests', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01, 0x02, 0x03]),
          invreqPayerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          description: 'Refund payment',
        }

        const result = validateInvoiceRequest(invreq)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invreq_amount required for non-offer invoice requests')
      })

      it('should validate quantity requirements', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01, 0x02, 0x03]),
          invreqPayerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          issuerId: hexToUint8Array(
            '0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          description: 'Test payment',
          invreqAmount: 1000n,
          quantityMax: 10n,
          invreqQuantity: 5n,
        }

        const result = validateInvoiceRequest(invreq)

        expect(result.isValid).toBe(true)
      })

      it('should reject quantity exceeding maximum', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01, 0x02, 0x03]),
          invreqPayerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          issuerId: hexToUint8Array(
            '0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          description: 'Test payment',
          quantityMax: 5n,
          invreqQuantity: 10n,
        }

        const result = validateInvoiceRequest(invreq)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invreq_quantity exceeds offer_quantity_max')
      })

      it('should validate BIP 353 name format', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01, 0x02, 0x03]),
          invreqPayerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          issuerId: hexToUint8Array(
            '0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          description: 'Test payment',
          invreqAmount: 1000n,
          invreqBip353Name: {
            name: new TextEncoder().encode('test'),
            domain: new TextEncoder().encode('example.com'),
          },
        }

        const result = validateInvoiceRequest(invreq)

        expect(result.isValid).toBe(true)
      })

      it('should reject invalid BIP 353 name characters', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01, 0x02, 0x03]),
          invreqPayerId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          issuerId: hexToUint8Array(
            '0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          description: 'Test payment',
          invreqBip353Name: {
            name: new TextEncoder().encode('test@invalid'),
            domain: new TextEncoder().encode('example.com'),
          },
        }

        const result = validateInvoiceRequest(invreq)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invreq_bip_353_name contains invalid characters')
      })
    })
  })

  describe('Invoice Validation', () => {
    describe('validateInvoice', () => {
      it('should validate a basic invoice', () => {
        const invoice: Invoice = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: 1000000000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = validateInvoice(invoice)

        expect(result.isValid).toBe(true)
        expect(result.errors).toEqual([])
      })

      it('should require invoice_amount', () => {
        const invoice: Omit<Invoice, 'invoiceAmount'> = {
          invoiceCreatedAt: 1000000000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = validateInvoice(invoice as Invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invoice_amount is required')
      })

      it('should require invoice_created_at', () => {
        const invoice: Omit<Invoice, 'invoiceCreatedAt'> = {
          invoiceAmount: 1000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = validateInvoice(invoice as Invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invoice_created_at is required')
      })

      it('should require invoice_payment_hash', () => {
        const invoice: Omit<Invoice, 'invoicePaymentHash'> = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: 1000000000n,
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = validateInvoice(invoice as Invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invoice_payment_hash is required')
      })

      it('should require invoice_node_id', () => {
        const invoice: Omit<Invoice, 'invoiceNodeId'> = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: 1000000000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = validateInvoice(invoice as Invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invoice_node_id is required')
      })

      it('should require signature', () => {
        const invoice: Omit<Invoice, 'signature'> = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: 1000000000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = validateInvoice(invoice as Invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('signature is required')
      })

      it('should require non-empty invoice_paths', () => {
        const invoice: Invoice = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: 1000000000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [],
          invoiceBlindedpay: [],
        }

        const result = validateInvoice(invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('invoice_paths is required and must not be empty')
      })

      it('should require invoice_blindedpay', () => {
        const invoice: Invoice = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: 1000000000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [],
        }

        const result = validateInvoice(invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain(
          'invoice_blindedpay must have exactly one entry per invoice_paths entry',
        )
      })

      it('should validate paths have at least one hop', () => {
        const invoice: Invoice = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: 1000000000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 0, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = validateInvoice(invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Blinded path in invoice_paths must have at least one hop')
      })

      it('should validate blindedpay count matches paths count', () => {
        const invoice: Invoice = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: 1000000000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [
            { numHops: 1, blindedHops: [] } as any,
            { numHops: 1, blindedHops: [] } as any,
          ],
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = validateInvoice(invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain(
          'invoice_blindedpay must have exactly one entry per invoice_paths entry',
        )
      })

      it('should validate fallback addresses', () => {
        const invoice: Invoice = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: 1000000000n,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
          invoiceFallbacks: [
            {
              version: 17, // Invalid version (>16)
              address: new Uint8Array([
                0x00, 0x14, 0x75, 0x1e, 0x76, 0xe8, 0x19, 0x91, 0x96, 0xd4, 0x54, 0x94, 0x1c, 0x45,
                0xd1, 0xb3, 0xa3, 0x23, 0xf1, 0x43, 0x3b, 0xd6,
              ]),
            },
          ],
        }

        const result = validateInvoice(invoice)

        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Fallback address version must be <= 16')
      })
    })

    describe('getInvoiceExpiryStatus', () => {
      it('should calculate expiry with default 7200 seconds', () => {
        const createdAt = 1000000000
        const currentTime = 1000001000 // 1000 seconds after creation
        const invoice: Invoice = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: BigInt(createdAt),
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = getInvoiceExpiryStatus(invoice, currentTime)

        expect(result.isExpired).toBe(false)
        expect(result.secondsUntilExpiry).toBe(7200 - 1000)
        expect(result.expiryTimestamp).toBe(createdAt + 7200)
      })

      it('should use custom relative expiry', () => {
        const createdAt = 1000000000
        const relativeExpiry = 3600 // 1 hour
        const currentTime = 1000001000 // 1000 seconds after creation
        const invoice: Invoice = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: BigInt(createdAt),
          invoiceRelativeExpiry: relativeExpiry,
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = getInvoiceExpiryStatus(invoice, currentTime)

        expect(result.isExpired).toBe(false)
        expect(result.secondsUntilExpiry).toBe(relativeExpiry - 1000)
        expect(result.expiryTimestamp).toBe(createdAt + relativeExpiry)
      })

      it('should detect expired invoices', () => {
        const createdAt = 1000000000
        const currentTime = 1000007300 // 7300 seconds after creation (past default expiry)
        const invoice: Invoice = {
          invoiceAmount: 1000n,
          invoiceCreatedAt: BigInt(createdAt),
          invoicePaymentHash: hexToSha256(
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ),
          invoiceNodeId: hexToUint8Array(
            '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
          ) as any,
          signature: hexToUint8Array(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ) as any,
          invoicePaths: [{ numHops: 1, blindedHops: [] }] as any,
          invoiceBlindedpay: [
            {
              feeBaseMsat: 1000,
              feeProportionalMillionths: 100,
              cltvExpiryDelta: 144,
              htlcMinimumMsat: 1000n,
              htlcMaximumMsat: 100000000n,
              features: new Uint8Array([]),
            },
          ],
        }

        const result = getInvoiceExpiryStatus(invoice, currentTime)

        expect(result.isExpired).toBe(true)
        expect(result.secondsUntilExpiry).toBe(0)
        expect(result.expiryTimestamp).toBe(createdAt + 7200)
      })
    })
  })

  describe('Utility Functions', () => {
    describe('extractTlvRange', () => {
      it('should extract TLV records within specified range', () => {
        const tlvStream: Bolt12TlvStream = [
          { type: 1n, length: 2n, value: new Uint8Array([0xaa, 0xbb]) },
          { type: 5n, length: 1n, value: new Uint8Array([0xcc]) },
          { type: 10n, length: 3n, value: new Uint8Array([0xdd, 0xee, 0xff]) },
        ]

        const result = extractTlvRange(tlvStream, 2n, 8n)

        expect(result).toEqual([{ type: 5n, length: 1n, value: new Uint8Array([0xcc]) }])
      })

      it('should return empty array if no records in range', () => {
        const tlvStream: Bolt12TlvStream = [
          { type: 1n, length: 2n, value: new Uint8Array([0xaa, 0xbb]) },
        ]

        const result = extractTlvRange(tlvStream, 5n, 10n)

        expect(result).toEqual([])
      })
    })

    describe('hasUnknownEvenFeatures', () => {
      it('should return false for empty features', () => {
        expect(hasUnknownEvenFeatures(new Uint8Array([]))).toBe(false)
      })

      it('should return false for features with only odd bits set', () => {
        // Bit 1 (odd) set
        expect(hasUnknownEvenFeatures(new Uint8Array([0x02]))).toBe(false)
        // Bit 3 (odd) set
        expect(hasUnknownEvenFeatures(new Uint8Array([0x08]))).toBe(false)
      })

      it('should return true for features with even bits set', () => {
        // Bit 0 (even) set
        expect(hasUnknownEvenFeatures(new Uint8Array([0x01]))).toBe(true)
        // Bit 2 (even) set
        expect(hasUnknownEvenFeatures(new Uint8Array([0x04]))).toBe(true)
      })
    })

    describe('getPaymentFlowType', () => {
      it('should return USER_PAYS_MERCHANT for offer response', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01]),
          invreqPayerId: new Uint8Array(32) as any,
          issuerId: new Uint8Array(32) as any,
          description: 'Test payment',
        }

        const result = getPaymentFlowType(invreq)

        expect(result).toBe(PaymentFlowType.USER_PAYS_MERCHANT)
      })

      it('should return MERCHANT_PAYS_USER for non-offer request', () => {
        const invreq: InvoiceRequest = {
          invreqMetadata: new Uint8Array([0x01]),
          invreqPayerId: new Uint8Array(32) as any,
          description: 'Refund payment',
          invreqAmount: 1000n,
        }

        const result = getPaymentFlowType(invreq)

        expect(result).toBe(PaymentFlowType.MERCHANT_PAYS_USER)
      })
    })
  })
})
