import { hexToUint8Array } from '../crypto'
import { uint8ArrayToHex } from '../utils'
import {
  encodeU16,
  decodeU16,
  encodeU32,
  decodeU32,
  encodeU64,
  decodeU64,
  encodeS16,
  decodeS16,
  encodeS32,
  decodeS32,
  encodeS64,
  decodeS64,
  encodeTu16,
  decodeTu16,
  encodeTu32,
  decodeTu32,
  encodeTu64,
  decodeTu64,
  encodeBigSize,
  decodeBigSize,
  encodeTlvStream,
  decodeTlvStream,
  encodeInitMessage,
  decodeInitMessage,
  encodeErrorMessage,
  decodeErrorMessage,
  encodeWarningMessage,
  decodeWarningMessage,
  encodePingMessage,
  decodePingMessage,
  encodePongMessage,
  decodePongMessage,
  encodePeerStorageMessage,
  decodePeerStorageMessage,
  encodePeerStorageRetrievalMessage,
  decodePeerStorageRetrievalMessage,
} from './base'

// Helper functions
/* function hexToUint8Array(hex: string): Uint8Array {
  const bytes = hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
  return new Uint8Array(bytes)
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr, byte => byte.toString(16).padStart(2, '0')).join('')
} */

// Basic Unsigned Integers
describe('Unsigned Integers', () => {
  describe('encodeU16 and decodeU16', () => {
    it('should encode and decode u16', () => {
      const value = 4660 // 0x1234
      const encoded = encodeU16(value)
      expect(uint8ArrayToHex(encoded)).toBe('1234')
      const decoded = decodeU16(encoded)
      expect(decoded).toBe(value)
    })
  })

  describe('encodeU32 and decodeU32', () => {
    it('should encode and decode u32', () => {
      const value = 305419896 // 0x12345678
      const encoded = encodeU32(value)
      expect(uint8ArrayToHex(encoded)).toBe('12345678')
      const decoded = decodeU32(encoded)
      expect(decoded).toBe(value)
    })
  })

  describe('encodeU64 and decodeU64', () => {
    it('should encode and decode u64', () => {
      const value = 1311768467463790320n // 0x123456789ABCDEF0
      const encoded = encodeU64(value)
      expect(uint8ArrayToHex(encoded)).toBe('123456789abcdef0')
      const decoded = decodeU64(encoded)
      expect(decoded).toBe(value)
    })
  })
})

// BigSize Test Vectors from Appendix A
describe('BigSize', () => {
  const bigSizeDecodingTests = [
    { name: 'zero', value: 0n, bytes: '00' },
    { name: 'one byte high', value: 252n, bytes: 'fc' },
    { name: 'two byte low', value: 253n, bytes: 'fd00fd' },
    { name: 'two byte high', value: 65535n, bytes: 'fdffff' },
    { name: 'four byte low', value: 65536n, bytes: 'fe00010000' },
    { name: 'four byte high', value: 4294967295n, bytes: 'feffffffff' },
    { name: 'eight byte low', value: 4294967296n, bytes: 'ff0000000100000000' },
    { name: 'eight byte high', value: 18446744073709551615n, bytes: 'ffffffffffffffffff' },
  ]

  const bigSizeEncodingTests = [
    { name: 'zero', value: 0n, bytes: '00' },
    { name: 'one byte high', value: 252n, bytes: 'fc' },
    { name: 'two byte low', value: 253n, bytes: 'fd00fd' },
    { name: 'two byte high', value: 65535n, bytes: 'fdffff' },
    { name: 'four byte low', value: 65536n, bytes: 'fe00010000' },
    { name: 'four byte high', value: 4294967295n, bytes: 'feffffffff' },
    { name: 'eight byte low', value: 4294967296n, bytes: 'ff0000000100000000' },
    { name: 'eight byte high', value: 18446744073709551615n, bytes: 'ffffffffffffffffff' },
  ]

  describe('decodeBigSize', () => {
    bigSizeDecodingTests.forEach(test => {
      it(`should decode ${test.name}`, () => {
        const buf = hexToUint8Array(test.bytes)
        const { value, bytesRead } = decodeBigSize(buf)
        expect(value).toBe(test.value)
        expect(bytesRead).toBe(buf.length)
      })
    })
  })

  describe('encodeBigSize', () => {
    bigSizeEncodingTests.forEach(test => {
      it(`should encode ${test.name}`, () => {
        const encoded = encodeBigSize(test.value)
        expect(uint8ArrayToHex(encoded)).toBe(test.bytes)
      })
    })
  })
})

// Signed Integers Test Vectors from Appendix D
describe('Signed Integers', () => {
  const s16Tests = [
    { value: 0, bytes: '0000' },
    { value: 42, bytes: '002a' },
    { value: -42, bytes: 'ffd6' },
    { value: 127, bytes: '007f' },
    { value: -128, bytes: 'ff80' },
    { value: 128, bytes: '0080' },
    { value: -129, bytes: 'ff7f' },
    { value: 15000, bytes: '3a98' },
    { value: -15000, bytes: 'c568' },
    { value: 32767, bytes: '7fff' },
    { value: -32768, bytes: '8000' },
  ]

  const s32Tests = [
    { value: 0, bytes: '00000000' },
    { value: 42, bytes: '0000002a' },
    { value: -42, bytes: 'ffffffd6' },
    { value: 127, bytes: '0000007f' },
    { value: -128, bytes: 'ffffff80' },
    { value: 128, bytes: '00000080' },
    { value: -129, bytes: 'ffffff7f' },
    { value: 15000, bytes: '00003a98' },
    { value: -15000, bytes: 'ffffc568' },
    { value: 32767, bytes: '00007fff' },
    { value: -32768, bytes: 'ffff8000' },
    { value: 32768, bytes: '00008000' },
    { value: -32769, bytes: 'ffff7fff' },
    { value: 21000000, bytes: '01406f40' },
    { value: -21000000, bytes: 'febf90c0' },
    { value: 2147483647, bytes: '7fffffff' },
    { value: -2147483648, bytes: '80000000' },
  ]

  const s64Tests = [
    { value: 0, bytes: '0000000000000000' },
    { value: 42, bytes: '000000000000002a' },
    { value: -42, bytes: 'ffffffffffffffd6' },
    { value: 127, bytes: '000000000000007f' },
    { value: -128, bytes: 'ffffffffffffff80' },
    { value: 128, bytes: '0000000000000080' },
    { value: -129, bytes: 'ffffffffffffff7f' },
    { value: 15000, bytes: '0000000000003a98' },
    { value: -15000, bytes: 'ffffffffffffc568' },
    { value: 32767, bytes: '0000000000007fff' },
    { value: -32768, bytes: 'ffffffffffff8000' },
    { value: 32768, bytes: '0000000000008000' },
    { value: -32769, bytes: 'ffffffffffff7fff' },
    { value: 21000000, bytes: '0000000001406f40' },
    { value: -21000000, bytes: 'fffffffffebf90c0' },
    { value: 2147483647, bytes: '000000007fffffff' },
    { value: -2147483648, bytes: 'ffffffff80000000' },
    { value: 2147483648, bytes: '0000000080000000' },
    { value: -2147483649, bytes: 'ffffffff7fffffff' },
    { value: 500000000000, bytes: '000000746a528800' },
    { value: -500000000000, bytes: 'ffffff8b95ad7800' },
    { value: BigInt('9223372036854775807'), bytes: '7fffffffffffffff' },
    { value: BigInt('-9223372036854775808'), bytes: '8000000000000000' },
  ]

  describe('encodeS16 and decodeS16', () => {
    s16Tests.forEach(test => {
      it(`should encode and decode s16: ${test.value}`, () => {
        const encoded = encodeS16(test.value)
        expect(uint8ArrayToHex(encoded)).toBe(test.bytes)
        const decoded = decodeS16(hexToUint8Array(test.bytes))
        expect(decoded).toBe(test.value)
      })
    })
  })

  describe('encodeS32 and decodeS32', () => {
    s32Tests.forEach(test => {
      it(`should encode and decode s32: ${test.value}`, () => {
        const encoded = encodeS32(test.value)
        expect(uint8ArrayToHex(encoded)).toBe(test.bytes)
        const decoded = decodeS32(hexToUint8Array(test.bytes))
        expect(decoded).toBe(test.value)
      })
    })
  })

  describe('encodeS64 and decodeS64', () => {
    s64Tests.forEach(test => {
      it(`should encode and decode s64: ${test.value}`, () => {
        const encoded = encodeS64(BigInt(test.value))
        expect(uint8ArrayToHex(encoded)).toBe(test.bytes)
        const decoded = decodeS64(hexToUint8Array(test.bytes))
        expect(decoded).toBe(BigInt(test.value))
      })
    })
  })
})

// Truncated Unsigned Integers
describe('Truncated Unsigned Integers', () => {
  describe('encodeTu16 and decodeTu16', () => {
    it('should encode and decode tu16', () => {
      expect(uint8ArrayToHex(encodeTu16(0))).toBe('')
      expect(uint8ArrayToHex(encodeTu16(1))).toBe('01')
      expect(uint8ArrayToHex(encodeTu16(255))).toBe('ff')
      expect(uint8ArrayToHex(encodeTu16(256))).toBe('0100')

      const { value: v1, bytesRead: b1 } = decodeTu16(hexToUint8Array('01'))
      expect(v1).toBe(1)
      expect(b1).toBe(1)

      const { value: v2, bytesRead: b2 } = decodeTu16(hexToUint8Array('0100'))
      expect(v2).toBe(256)
      expect(b2).toBe(2)
    })
  })

  describe('encodeTu32 and decodeTu32', () => {
    it('should encode and decode tu32', () => {
      expect(uint8ArrayToHex(encodeTu32(0))).toBe('')
      expect(uint8ArrayToHex(encodeTu32(252))).toBe('fc')
      expect(uint8ArrayToHex(encodeTu32(253))).toBe('fd')

      const { value: v1, bytesRead: b1 } = decodeTu32(hexToUint8Array('fc'))
      expect(v1).toBe(252)
      expect(b1).toBe(1)

      const { value: v2, bytesRead: b2 } = decodeTu32(hexToUint8Array('fd'))
      expect(v2).toBe(253)
      expect(b2).toBe(1)
    })
  })

  describe('encodeTu64 and decodeTu64', () => {
    it('should encode and decode tu64', () => {
      expect(uint8ArrayToHex(encodeTu64(0n))).toBe('')
      expect(uint8ArrayToHex(encodeTu64(252n))).toBe('fc')
      expect(uint8ArrayToHex(encodeTu64(253n))).toBe('fd')
      expect(uint8ArrayToHex(encodeTu64(65535n))).toBe('ffff')
      expect(uint8ArrayToHex(encodeTu64(65536n))).toBe('00010000')

      const { value: v1, bytesRead: b1 } = decodeTu64(hexToUint8Array('fc'))
      expect(v1).toBe(252n)
      expect(b1).toBe(1)

      const { value: v2, bytesRead: b2 } = decodeTu64(hexToUint8Array('fd'))
      expect(v2).toBe(253n)
      expect(b2).toBe(1)
    })
  })
})

// TLV Test Vectors from Appendix B
describe('TLV', () => {
  describe('decodeTlvStream', () => {
    it('should decode valid TLV streams', () => {
      // From Appendix B: TLV Decoding Successes
      const validStreams = [
        { stream: '', explanation: 'empty message' },
        { stream: '2100', explanation: 'Unknown odd type' },
        { stream: 'fd020100', explanation: 'Unknown odd type' },
      ]

      validStreams.forEach(test => {
        const buf = hexToUint8Array(test.stream)
        const records = decodeTlvStream(buf)
        // Should not throw
        expect(records).toBeDefined()
      })
    })

    it('should fail on invalid TLV streams', () => {
      // From Appendix B: TLV Decoding Failures
      const invalidStreams = [
        'fd', // type truncated
        'fd01', // type truncated
        'fd000100', // not minimally encoded type
      ]

      invalidStreams.forEach(stream => {
        const buf = hexToUint8Array(stream)
        expect(() => decodeTlvStream(buf)).toThrow()
      })
    })
  })

  describe('encodeTlvStream', () => {
    it('should encode TLV streams', () => {
      const records = [
        { type: 1n, length: 1n, value: new Uint8Array([42]) },
        { type: 2n, length: 2n, value: new Uint8Array([1, 2]) },
      ]
      const encoded = encodeTlvStream(records)
      const decoded = decodeTlvStream(encoded)
      expect(decoded).toEqual(records)
    })
  })
})

// Message Tests
describe('Messages', () => {
  describe('Init Message', () => {
    it('should encode and decode init message', () => {
      const msg = {
        type: 16,
        gflen: 0,
        globalfeatures: new Uint8Array(0),
        flen: 0,
        features: new Uint8Array(0),
        tlvs: [],
      }
      const encoded = encodeInitMessage(msg)
      const decoded = decodeInitMessage(encoded)
      expect(decoded).toEqual(msg)
    })
  })

  describe('Error Message', () => {
    it('should encode and decode error message', () => {
      const msg = {
        type: 17,
        channelId: new Uint8Array(32).fill(0),
        len: 5,
        data: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
      }
      const encoded = encodeErrorMessage(msg)
      const decoded = decodeErrorMessage(encoded)
      expect(decoded).toEqual(msg)
    })
  })

  describe('Warning Message', () => {
    it('should encode and decode warning message', () => {
      const msg = {
        type: 1,
        channelId: new Uint8Array(32).fill(0),
        len: 5,
        data: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
      }
      const encoded = encodeWarningMessage(msg)
      const decoded = decodeWarningMessage(encoded)
      expect(decoded).toEqual(msg)
    })
  })

  describe('Ping Message', () => {
    it('should encode and decode ping message', () => {
      const msg = {
        type: 18,
        numPongBytes: 2,
        byteslen: 2,
        ignored: new Uint8Array([0, 0]),
      }
      const encoded = encodePingMessage(msg)
      const decoded = decodePingMessage(encoded)
      expect(decoded).toEqual(msg)
    })
  })

  describe('Pong Message', () => {
    it('should encode and decode pong message', () => {
      const msg = {
        type: 19,
        byteslen: 2,
        ignored: new Uint8Array([0, 0]),
      }
      const encoded = encodePongMessage(msg)
      const decoded = decodePongMessage(encoded)
      expect(decoded).toEqual(msg)
    })
  })

  describe('Peer Storage Message', () => {
    it('should encode and decode peer storage message', () => {
      const msg = {
        type: 7,
        length: 4,
        blob: new Uint8Array([1, 2, 3, 4]),
      }
      const encoded = encodePeerStorageMessage(msg)
      const decoded = decodePeerStorageMessage(encoded)
      expect(decoded).toEqual(msg)
    })
  })

  describe('Peer Storage Retrieval Message', () => {
    it('should encode and decode peer storage retrieval message', () => {
      const msg = {
        type: 9,
        length: 4,
        blob: new Uint8Array([1, 2, 3, 4]),
      }
      const encoded = encodePeerStorageRetrievalMessage(msg)
      const decoded = decodePeerStorageRetrievalMessage(encoded)
      expect(decoded).toEqual(msg)
    })
  })
})
