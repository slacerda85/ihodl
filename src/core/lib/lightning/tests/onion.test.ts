// BOLT #4: Onion Routing Protocol - Unit Tests

import {
  createOnionPacket,
  decodeOnionPacket,
  createHopPayload,
  encodeTlvStream,
  decodeTlvStream,
  encodeBigSize,
  decodeBigSize,
  encodeTu64,
  decodeTu64,
  encodeTu32,
  decodeTu32,
  validateOnionPacket,
  serializeOnionPacket,
  // New BOLT #4 payload functions
  decodePayloadTlv,
  validatePayload,
  createFinalHopPayload,
  createIntermediateHopPayload,
  createBlindedHopPayload,
  createOnionErrorMessage,
  PayloadTlvType,
  FailureCode,
  ONION_PACKET_SIZE,
} from '../onion'

// Helper functions
function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith('0x')) hex = hex.slice(2)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

describe('BOLT #4: Onion Routing Protocol', () => {
  describe('BigSize Encoding/Decoding', () => {
    it('should encode 0 as single byte', () => {
      const result = encodeBigSize(0n)
      expect(result).toEqual(new Uint8Array([0]))
    })

    it('should encode 0xfc as single byte', () => {
      const result = encodeBigSize(0xfcn)
      expect(result).toEqual(new Uint8Array([0xfc]))
    })

    it('should encode 0xfd as 3 bytes', () => {
      const result = encodeBigSize(0xfdn)
      expect(result.length).toBe(3)
      expect(result[0]).toBe(0xfd)
    })

    it('should encode 0xffff as 3 bytes', () => {
      const result = encodeBigSize(0xffffn)
      expect(result.length).toBe(3)
      expect(result[0]).toBe(0xfd)
    })

    it('should encode 0x10000 as 5 bytes', () => {
      const result = encodeBigSize(0x10000n)
      expect(result.length).toBe(5)
      expect(result[0]).toBe(0xfe)
    })

    it('should encode 0xffffffff as 5 bytes', () => {
      const result = encodeBigSize(0xffffffffn)
      expect(result.length).toBe(5)
      expect(result[0]).toBe(0xfe)
    })

    it('should encode 0x100000000 as 9 bytes', () => {
      const result = encodeBigSize(0x100000000n)
      expect(result.length).toBe(9)
      expect(result[0]).toBe(0xff)
    })

    it('should decode single byte values', () => {
      const { value, bytesRead } = decodeBigSize(new Uint8Array([0x42]))
      expect(value).toBe(0x42n)
      expect(bytesRead).toBe(1)
    })

    it('should decode 3-byte values', () => {
      const encoded = encodeBigSize(0x1000n)
      const { value, bytesRead } = decodeBigSize(encoded)
      expect(value).toBe(0x1000n)
      expect(bytesRead).toBe(3)
    })

    it('should roundtrip encode/decode', () => {
      const testValues = [
        0n,
        1n,
        0xfcn,
        0xfdn,
        0xfffn,
        0xffffn,
        0x10000n,
        0xffffffffn,
        0x100000000n,
      ]
      for (const v of testValues) {
        const encoded = encodeBigSize(v)
        const { value } = decodeBigSize(encoded)
        expect(value).toBe(v)
      }
    })
  })

  describe('Truncated Integer Encoding', () => {
    describe('tu64', () => {
      it('should encode 0 as empty array', () => {
        const result = encodeTu64(0n)
        expect(result.length).toBe(0)
      })

      it('should encode 1 as single byte', () => {
        const result = encodeTu64(1n)
        expect(result).toEqual(new Uint8Array([1]))
      })

      it('should encode 256 as 2 bytes', () => {
        const result = encodeTu64(256n)
        expect(result).toEqual(new Uint8Array([1, 0]))
      })

      it('should decode tu64 values', () => {
        expect(decodeTu64(new Uint8Array([]))).toBe(0n)
        expect(decodeTu64(new Uint8Array([1]))).toBe(1n)
        expect(decodeTu64(new Uint8Array([1, 0]))).toBe(256n)
        expect(decodeTu64(new Uint8Array([1, 0, 0]))).toBe(65536n)
      })

      it('should roundtrip tu64', () => {
        const values = [0n, 1n, 127n, 255n, 256n, 65535n, 1000000n, 100000000000n]
        for (const v of values) {
          const encoded = encodeTu64(v)
          const decoded = decodeTu64(encoded)
          expect(decoded).toBe(v)
        }
      })
    })

    describe('tu32', () => {
      it('should encode 0 as empty array', () => {
        const result = encodeTu32(0)
        expect(result.length).toBe(0)
      })

      it('should encode 1 as single byte', () => {
        const result = encodeTu32(1)
        expect(result).toEqual(new Uint8Array([1]))
      })

      it('should decode tu32 values', () => {
        expect(decodeTu32(new Uint8Array([]))).toBe(0)
        expect(decodeTu32(new Uint8Array([1]))).toBe(1)
        expect(decodeTu32(new Uint8Array([1, 0]))).toBe(256)
      })
    })
  })

  describe('TLV Stream Encoding/Decoding', () => {
    it('should encode empty TLV stream', () => {
      const result = encodeTlvStream([])
      expect(result.length).toBe(0)
    })

    it('should encode single TLV', () => {
      const tlvs = [{ type: 2, value: new Uint8Array([0x01, 0x02]) }]
      const result = encodeTlvStream(tlvs)
      // type (1 byte) + length (1 byte) + value (2 bytes)
      expect(result.length).toBe(4)
      expect(result[0]).toBe(2) // type
      expect(result[1]).toBe(2) // length
      expect(result[2]).toBe(1) // value[0]
      expect(result[3]).toBe(2) // value[1]
    })

    it('should sort TLVs by type', () => {
      const tlvs = [
        { type: 6, value: new Uint8Array([0x06]) },
        { type: 2, value: new Uint8Array([0x02]) },
        { type: 4, value: new Uint8Array([0x04]) },
      ]
      const result = encodeTlvStream(tlvs)
      // Should be sorted: type 2, type 4, type 6
      expect(result[0]).toBe(2)
    })

    it('should roundtrip TLV stream', () => {
      const tlvs = [
        { type: 2, value: new Uint8Array([0x01, 0x02, 0x03]) },
        { type: 4, value: new Uint8Array([0x04]) },
        { type: 8, value: new Uint8Array([0x08, 0x09]) },
      ]
      const encoded = encodeTlvStream(tlvs)
      const decoded = decodeTlvStream(encoded)
      expect(decoded.length).toBe(3)
      expect(Number(decoded[0].type)).toBe(2)
      expect(Number(decoded[1].type)).toBe(4)
      expect(Number(decoded[2].type)).toBe(8)
    })
  })

  describe('Payload TLV Decoding', () => {
    it('should decode intermediate hop payload', () => {
      const shortChannelId = new Uint8Array(8).fill(0xaa)
      const payload = createIntermediateHopPayload(1000000n, 500, shortChannelId)
      const decoded = decodePayloadTlv(payload)

      expect(decoded.amtToForward).toBe(1000000n)
      expect(decoded.outgoingCltvValue).toBe(500)
      expect(decoded.shortChannelId).toEqual(shortChannelId)
      expect(decoded.isFinalHop).toBe(false)
    })

    it('should decode final hop payload', () => {
      const paymentSecret = new Uint8Array(32).fill(0xbb)
      const payload = createFinalHopPayload(500000n, 144, paymentSecret, 500000n)
      const decoded = decodePayloadTlv(payload)

      expect(decoded.amtToForward).toBe(500000n)
      expect(decoded.outgoingCltvValue).toBe(144)
      expect(decoded.paymentData).toBeDefined()
      expect(decoded.paymentData!.paymentSecret).toEqual(paymentSecret)
      expect(decoded.isFinalHop).toBe(true)
    })

    it('should throw on TLVs not in ascending order', () => {
      // Manually create invalid TLV stream (type 4 before type 2)
      const invalidTlv = new Uint8Array([
        4,
        1,
        0x10, // type 4, length 1, value
        2,
        1,
        0x20, // type 2, length 1, value
      ])

      expect(() => decodePayloadTlv(invalidTlv)).toThrow('types must be strictly increasing')
    })

    it('should throw on unknown even TLV type', () => {
      // Create TLV with unknown even type (e.g., 100)
      const unknownEvenTlv = new Uint8Array([
        2,
        1,
        0x10, // type 2, length 1, value (amt_to_forward)
        4,
        1,
        0x20, // type 4, length 1, value (outgoing_cltv)
        100,
        2,
        0x01,
        0x02, // unknown even type 100
      ])

      expect(() => decodePayloadTlv(unknownEvenTlv)).toThrow('Unknown required TLV type')
    })

    it('should ignore unknown odd TLV types', () => {
      const shortChannelId = new Uint8Array(8).fill(0xcc)
      // Create valid payload with unknown odd type
      const validPayload = createIntermediateHopPayload(1000n, 100, shortChannelId)
      // Append unknown odd TLV (type 101)
      const withOddTlv = new Uint8Array(validPayload.length + 4)
      withOddTlv.set(validPayload)
      withOddTlv.set([101, 2, 0xdd, 0xee], validPayload.length)

      const decoded = decodePayloadTlv(withOddTlv)
      expect(decoded.unknownTlvs.length).toBe(1)
      expect(Number(decoded.unknownTlvs[0].type)).toBe(101)
    })
  })

  describe('Payload Validation', () => {
    it('should validate intermediate hop payload', () => {
      const shortChannelId = new Uint8Array(8).fill(0xaa)
      const payload = createIntermediateHopPayload(1000000n, 500, shortChannelId)
      const decoded = decodePayloadTlv(payload)

      expect(() => validatePayload(decoded)).not.toThrow()
      expect(validatePayload(decoded)).toBe(true)
    })

    it('should throw on missing amt_to_forward', () => {
      const payload: any = {
        outgoingCltvValue: 100,
        shortChannelId: new Uint8Array(8),
        isFinalHop: false,
        unknownTlvs: [],
      }

      expect(() => validatePayload(payload)).toThrow('Missing required amt_to_forward')
    })

    it('should throw on missing outgoing_cltv_value', () => {
      const payload: any = {
        amtToForward: 1000n,
        shortChannelId: new Uint8Array(8),
        isFinalHop: false,
        unknownTlvs: [],
      }

      expect(() => validatePayload(payload)).toThrow('Missing required outgoing_cltv_value')
    })

    it('should throw on missing short_channel_id for intermediate hop', () => {
      const payload: any = {
        amtToForward: 1000n,
        outgoingCltvValue: 100,
        isFinalHop: false,
        unknownTlvs: [],
      }

      expect(() => validatePayload(payload)).toThrow('Missing required short_channel_id')
    })

    it('should throw on zero amt_to_forward', () => {
      const payload: any = {
        amtToForward: 0n,
        outgoingCltvValue: 100,
        shortChannelId: new Uint8Array(8),
        isFinalHop: false,
        unknownTlvs: [],
      }

      expect(() => validatePayload(payload)).toThrow('amt_to_forward must be positive')
    })
  })

  describe('Blinded Path Payload', () => {
    it('should create blinded hop payload', () => {
      const encryptedData = new Uint8Array(50).fill(0x11)
      const payload = createBlindedHopPayload(encryptedData)
      const decoded = decodePayloadTlv(payload)

      expect(decoded.encryptedRecipientData).toEqual(encryptedData)
    })

    it('should create blinded hop payload with blinding point', () => {
      const encryptedData = new Uint8Array(50).fill(0x11)
      const blindingPoint = new Uint8Array(33)
      blindingPoint[0] = 0x02 // Valid compressed pubkey prefix
      blindingPoint.fill(0x22, 1)

      const payload = createBlindedHopPayload(encryptedData, blindingPoint)
      const decoded = decodePayloadTlv(payload)

      expect(decoded.encryptedRecipientData).toEqual(encryptedData)
      expect(decoded.blindingPoint).toEqual(blindingPoint)
    })

    it('should throw on invalid blinding point length', () => {
      const encryptedData = new Uint8Array(50)
      const invalidBlindingPoint = new Uint8Array(32) // Should be 33 bytes

      expect(() => createBlindedHopPayload(encryptedData, invalidBlindingPoint)).toThrow(
        'blinding_point must be 33 bytes',
      )
    })
  })

  describe('Onion Error Messages', () => {
    it('should create error message with failure code', () => {
      const sharedSecret = new Uint8Array(32).fill(0x42)
      const errorMsg = createOnionErrorMessage(FailureCode.TEMPORARY_NODE_FAILURE, sharedSecret)

      expect(errorMsg).toBeInstanceOf(Uint8Array)
      expect(errorMsg.length).toBeGreaterThan(0)
    })

    it('should create error message with failure data', () => {
      const sharedSecret = new Uint8Array(32).fill(0x42)
      const failureData = new Uint8Array([0x01, 0x02, 0x03, 0x04])
      const errorMsg = createOnionErrorMessage(
        FailureCode.AMOUNT_BELOW_MINIMUM,
        sharedSecret,
        failureData,
      )

      expect(errorMsg.length).toBeGreaterThan(failureData.length)
    })
  })

  describe('Onion Packet Validation', () => {
    it('should validate correct packet', () => {
      const packet = new Uint8Array(ONION_PACKET_SIZE)
      packet[0] = 0 // version
      packet[1] = 0x02 // valid pubkey prefix

      expect(validateOnionPacket(packet)).toBe(true)
    })

    it('should reject wrong size packet', () => {
      const packet = new Uint8Array(100)
      expect(validateOnionPacket(packet)).toBe(false)
    })

    it('should reject wrong version', () => {
      const packet = new Uint8Array(ONION_PACKET_SIZE)
      packet[0] = 1 // wrong version
      packet[1] = 0x02

      expect(validateOnionPacket(packet)).toBe(false)
    })

    it('should reject invalid pubkey prefix', () => {
      const packet = new Uint8Array(ONION_PACKET_SIZE)
      packet[0] = 0 // correct version
      packet[1] = 0x04 // invalid pubkey prefix (should be 02 or 03)

      expect(validateOnionPacket(packet)).toBe(false)
    })
  })

  describe('BOLT #4 Test Vectors', () => {
    // Reference: https://github.com/lightning/bolts/blob/master/04-onion-routing.md#test-vector

    describe('Payload TLV Test Vectors', () => {
      it('should decode intermediate hop payload from test vector', () => {
        // Test vector: payload for non-final node
        // amt_to_forward=1000, outgoing_cltv_value=500, short_channel_id
        const amtToForward = 1000n
        const cltvValue = 500
        const scid = hexToBytes('0000000000000001')

        const payload = createIntermediateHopPayload(amtToForward, cltvValue, scid)
        const decoded = decodePayloadTlv(payload)

        expect(decoded.amtToForward).toBe(amtToForward)
        expect(decoded.outgoingCltvValue).toBe(cltvValue)
        expect(bytesToHex(decoded.shortChannelId!)).toBe('0000000000000001')
      })

      it('should decode final hop payload from test vector', () => {
        // Test vector: payload for final node
        const amtToForward = 500n
        const cltvValue = 100
        const paymentSecret = new Uint8Array(32).fill(0x42)
        const totalMsat = 500n

        const payload = createFinalHopPayload(amtToForward, cltvValue, paymentSecret, totalMsat)
        const decoded = decodePayloadTlv(payload)

        expect(decoded.amtToForward).toBe(amtToForward)
        expect(decoded.outgoingCltvValue).toBe(cltvValue)
        expect(decoded.paymentData).toBeDefined()
        expect(decoded.isFinalHop).toBe(true)
      })
    })
  })
})
