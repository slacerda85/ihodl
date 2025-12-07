/**
 * Bech32m (BIP 350) Tests for P2TR Addresses
 *
 * Test vectors from:
 * - BIP 350: https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki
 * - BIP 341: https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
 */

import {
  encode,
  decode,
  toWords,
  fromWords,
  encodeP2TR,
  decodeP2TR,
  isValidP2TR,
  createP2TRScriptPubKey,
  extractP2TRPubkey,
  isP2TRScriptPubKey,
  addressToScriptPubKey,
  scriptPubKeyToAddress,
  Encoding,
  NETWORK_PREFIX,
} from './bech32m'

describe('Bech32m Encoding', () => {
  describe('toWords / fromWords', () => {
    it('should convert bytes to 5-bit words and back', () => {
      const original = new Uint8Array([0x00, 0x14, 0x75, 0x1e, 0x76, 0xe8])
      const words = toWords(original)
      const recovered = fromWords(words)

      expect(recovered).toEqual(original)
    })

    it('should handle 32-byte keys', () => {
      const key = new Uint8Array(32)
      for (let i = 0; i < 32; i++) key[i] = i

      const words = toWords(key)
      const recovered = fromWords(words)

      expect(recovered).toEqual(key)
    })

    it('should throw on invalid padding when checkPadding is true', () => {
      // Words that would result in non-zero padding bits at the end
      // 3 words of 5 bits = 15 bits = 1 byte (8 bits) + 7 padding bits
      // [0x1f, 0x1f, 0x1f] = 11111 11111 11111 -> 1 byte + 7 bits padding (all 1s = invalid)
      const invalidWords = [0x1f, 0x1f, 0x1f]

      expect(() => fromWords(invalidWords, true)).toThrow('Invalid padding')
    })

    it('should not throw on invalid padding when checkPadding is false', () => {
      const invalidWords = [0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x01]

      expect(() => fromWords(invalidWords, false)).not.toThrow()
    })
  })

  describe('encode / decode', () => {
    // BIP 350 test vectors for Bech32m
    const validBech32m = [
      'A1LQFN3A',
      'a1lqfn3a',
      'an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6',
      'abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx',
      '11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8',
      'split1checkupstagehandshakeupstreamerranterredcaperredlc445v',
      '?1v759aa',
    ]

    it('should decode valid Bech32m strings', () => {
      for (const str of validBech32m) {
        const result = decode(str)
        expect(result.encoding).toBe(Encoding.BECH32M)
      }
    })

    it('should round-trip encode/decode', () => {
      const hrp = 'bc'
      const data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

      const encoded = encode(hrp, data, Encoding.BECH32M)
      const decoded = decode(encoded)

      expect(decoded.prefix).toBe(hrp)
      expect(decoded.words).toEqual(data)
      expect(decoded.encoding).toBe(Encoding.BECH32M)
    })

    it('should reject mixed case', () => {
      expect(() => decode('A1LqFn3A')).toThrow('mixed case')
    })

    it('should reject invalid characters', () => {
      expect(() => decode('a1b2c3d4')).toThrow('Invalid character')
    })

    it('should reject invalid checksum', () => {
      // Valid Bech32m string with last character changed to create invalid checksum
      // Original: 'a1lqfn3a', modified: 'a1lqfn3q' (valid bech32 character)
      expect(() => decode('a1lqfn3q')).toThrow('checksum')
    })
  })

  describe('Bech32 vs Bech32m detection', () => {
    it('should detect Bech32 encoding (witness v0)', () => {
      // Valid Bech32 address (P2WPKH)
      const bech32Address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
      const result = decode(bech32Address)

      expect(result.encoding).toBe(Encoding.BECH32)
    })

    it('should detect Bech32m encoding (witness v1)', () => {
      // Valid Bech32m address (P2TR)
      const bech32mAddress = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'
      const result = decode(bech32mAddress)

      expect(result.encoding).toBe(Encoding.BECH32M)
    })
  })
})

describe('P2TR Address Functions', () => {
  // BIP 350/341 test vectors
  const testVectors = [
    {
      // From BIP 350
      address: 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
      xOnlyPubkey: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      prefix: 'bc',
    },
    {
      // From BIP 350
      address: 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c',
      xOnlyPubkey: '000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433',
      prefix: 'tb',
    },
  ]

  describe('encodeP2TR', () => {
    it('should encode valid P2TR addresses', () => {
      for (const vector of testVectors) {
        const xOnlyPubkey = hexToBytes(vector.xOnlyPubkey)
        const address = encodeP2TR(xOnlyPubkey, vector.prefix as 'bc' | 'tb')

        expect(address.toLowerCase()).toBe(vector.address.toLowerCase())
      }
    })

    it('should reject invalid key length', () => {
      const invalidKey = new Uint8Array(31)
      expect(() => encodeP2TR(invalidKey)).toThrow('Invalid x-only public key length')

      const tooLongKey = new Uint8Array(33)
      expect(() => encodeP2TR(tooLongKey)).toThrow('Invalid x-only public key length')
    })

    it('should use mainnet prefix by default', () => {
      const key = new Uint8Array(32).fill(0x01)
      const address = encodeP2TR(key)

      expect(address.startsWith('bc1p')).toBe(true)
    })

    it('should support testnet prefix', () => {
      const key = new Uint8Array(32).fill(0x01)
      const address = encodeP2TR(key, 'tb')

      expect(address.startsWith('tb1p')).toBe(true)
    })

    it('should support regtest prefix', () => {
      const key = new Uint8Array(32).fill(0x01)
      const address = encodeP2TR(key, 'bcrt')

      expect(address.startsWith('bcrt1p')).toBe(true)
    })
  })

  describe('decodeP2TR', () => {
    it('should decode valid P2TR addresses', () => {
      for (const vector of testVectors) {
        const result = decodeP2TR(vector.address)

        expect(result.prefix).toBe(vector.prefix)
        expect(bytesToHex(result.xOnlyPubkey)).toBe(vector.xOnlyPubkey)
      }
    })

    it('should reject Bech32 (v0) addresses', () => {
      const p2wpkhAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'

      expect(() => decodeP2TR(p2wpkhAddress)).toThrow('must use Bech32m encoding')
    })

    it('should reject witness v0 with Bech32m encoding', () => {
      // This is an invalid construction - v0 should use Bech32
      // We need to construct a v0 address with Bech32m checksum
      const v0Data = [0, ...toWords(new Uint8Array(20).fill(0x01))]
      const invalidAddress = encode('bc', v0Data, Encoding.BECH32M)

      expect(() => decodeP2TR(invalidAddress)).toThrow('Invalid witness version for P2TR')
    })
  })

  describe('isValidP2TR', () => {
    it('should return true for valid P2TR addresses', () => {
      for (const vector of testVectors) {
        expect(isValidP2TR(vector.address)).toBe(true)
      }
    })

    it('should return false for P2WPKH addresses', () => {
      const p2wpkhAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
      expect(isValidP2TR(p2wpkhAddress)).toBe(false)
    })

    it('should return false for invalid addresses', () => {
      expect(isValidP2TR('invalid')).toBe(false)
      expect(isValidP2TR('')).toBe(false)
      expect(isValidP2TR('bc1p')).toBe(false)
    })
  })

  describe('createP2TRScriptPubKey', () => {
    it('should create correct scriptPubKey', () => {
      const xOnlyPubkey = hexToBytes(testVectors[0].xOnlyPubkey)
      const scriptPubKey = createP2TRScriptPubKey(xOnlyPubkey)

      expect(scriptPubKey.length).toBe(34)
      expect(scriptPubKey[0]).toBe(0x51) // OP_1
      expect(scriptPubKey[1]).toBe(0x20) // PUSH32
      expect(scriptPubKey.slice(2)).toEqual(xOnlyPubkey)
    })

    it('should reject invalid key length', () => {
      expect(() => createP2TRScriptPubKey(new Uint8Array(31))).toThrow()
      expect(() => createP2TRScriptPubKey(new Uint8Array(33))).toThrow()
    })
  })

  describe('extractP2TRPubkey', () => {
    it('should extract pubkey from valid scriptPubKey', () => {
      const xOnlyPubkey = hexToBytes(testVectors[0].xOnlyPubkey)
      const scriptPubKey = createP2TRScriptPubKey(xOnlyPubkey)
      const extracted = extractP2TRPubkey(scriptPubKey)

      expect(extracted).toEqual(xOnlyPubkey)
    })

    it('should reject invalid scriptPubKey length', () => {
      expect(() => extractP2TRPubkey(new Uint8Array(33))).toThrow()
    })

    it('should reject non-P2TR scripts', () => {
      const invalidScript = new Uint8Array(34)
      invalidScript[0] = 0x00 // Not OP_1
      invalidScript[1] = 0x20

      expect(() => extractP2TRPubkey(invalidScript)).toThrow('expected OP_1')
    })
  })

  describe('isP2TRScriptPubKey', () => {
    it('should return true for P2TR scripts', () => {
      const xOnlyPubkey = new Uint8Array(32).fill(0x01)
      const scriptPubKey = createP2TRScriptPubKey(xOnlyPubkey)

      expect(isP2TRScriptPubKey(scriptPubKey)).toBe(true)
    })

    it('should return false for P2WPKH scripts', () => {
      // P2WPKH: OP_0 PUSH20 <20-byte-hash>
      const p2wpkhScript = new Uint8Array(22)
      p2wpkhScript[0] = 0x00 // OP_0
      p2wpkhScript[1] = 0x14 // PUSH20

      expect(isP2TRScriptPubKey(p2wpkhScript)).toBe(false)
    })

    it('should return false for wrong length', () => {
      expect(isP2TRScriptPubKey(new Uint8Array(33))).toBe(false)
      expect(isP2TRScriptPubKey(new Uint8Array(35))).toBe(false)
    })
  })

  describe('addressToScriptPubKey / scriptPubKeyToAddress', () => {
    it('should round-trip correctly', () => {
      for (const vector of testVectors) {
        const scriptPubKey = addressToScriptPubKey(vector.address)
        const recoveredAddress = scriptPubKeyToAddress(scriptPubKey, vector.prefix as 'bc' | 'tb')

        expect(recoveredAddress.toLowerCase()).toBe(vector.address.toLowerCase())
      }
    })
  })
})

describe('Network Prefixes', () => {
  it('should have correct prefix constants', () => {
    expect(NETWORK_PREFIX.MAINNET).toBe('bc')
    expect(NETWORK_PREFIX.TESTNET).toBe('tb')
    expect(NETWORK_PREFIX.SIGNET).toBe('tb')
    expect(NETWORK_PREFIX.REGTEST).toBe('bcrt')
  })
})

// Helper functions
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
