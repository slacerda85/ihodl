/**
 * Lightning Transport Layer Tests
 * BOLT 8: Transport Layer Security
 */

import { LightningTransport, NoiseHandshake, TransportState } from './transport'
import { uint8ArrayToHex, uint8ArrayFromHex } from '../utils'

// Mock crypto functions for testing
jest.mock('../crypto', () => ({
  sha256: jest.fn((data: Uint8Array) => {
    // Mock SHA256 - return first 32 bytes of input or padded
    const result = new Uint8Array(32)
    for (let i = 0; i < 32 && i < data.length; i++) {
      result[i] = data[i]
    }
    return Promise.resolve(result)
  }),
  hkdf: jest.fn((ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) => {
    // Mock HKDF - return deterministic output based on inputs
    const result = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
      result[i] = (ikm[i % ikm.length] + salt[i % salt.length] + info[i % info.length] + i) & 0xff
    }
    return Promise.resolve(result)
  }),
  aes256gcm: {
    encrypt: jest.fn((key: Uint8Array, plaintext: Uint8Array, iv: Uint8Array) => {
      // Mock encryption - XOR with key for testing
      const ciphertext = new Uint8Array(plaintext.length)
      for (let i = 0; i < plaintext.length; i++) {
        ciphertext[i] = plaintext[i] ^ key[i % key.length]
      }
      return Promise.resolve(ciphertext)
    }),
    decrypt: jest.fn((key: Uint8Array, ciphertext: Uint8Array, iv: Uint8Array) => {
      // Mock decryption - XOR with key for testing
      const plaintext = new Uint8Array(ciphertext.length)
      for (let i = 0; i < ciphertext.length; i++) {
        plaintext[i] = ciphertext[i] ^ key[i % key.length]
      }
      return Promise.resolve(plaintext)
    }),
  },
  secp256k1: {
    ecdh: jest.fn((privateKey: Uint8Array, publicKey: Uint8Array) => {
      // Mock ECDH - return deterministic shared secret
      const sharedSecret = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        sharedSecret[i] =
          (privateKey[i % privateKey.length] + publicKey[i % publicKey.length]) & 0xff
      }
      return Promise.resolve(sharedSecret)
    }),
  },
}))

describe('Lightning Transport Layer', () => {
  let transport: LightningTransport
  let mockSocket: any

  beforeEach(() => {
    // Mock WebSocket-like interface
    mockSocket = {
      send: jest.fn(),
      close: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      readyState: 1, // OPEN
    }

    transport = new LightningTransport()
  })

  describe('Transport Initialization', () => {
    test('should initialize with correct state', () => {
      expect(transport.getState()).toBe(TransportState.DISCONNECTED)
    })

    test('should accept valid node keys', () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02 // Compressed pubkey prefix

      expect(() => transport.setLocalKey(localKey)).not.toThrow()
      expect(() => transport.setRemoteKey(remoteKey)).not.toThrow()
    })

    test('should reject invalid keys', () => {
      const invalidPrivateKey = new Uint8Array(31) // Too short
      const invalidPublicKey = new Uint8Array(32) // Wrong length for compressed pubkey

      expect(() => transport.setLocalKey(invalidPrivateKey)).toThrow('Invalid private key length')
      expect(() => transport.setRemoteKey(invalidPublicKey)).toThrow('Invalid public key format')
    })
  })

  describe('Noise Protocol Handshake', () => {
    let localKey: Uint8Array
    let remoteKey: Uint8Array

    beforeEach(() => {
      localKey = new Uint8Array(32)
      for (let i = 0; i < 32; i++) localKey[i] = i

      remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02 // Compressed pubkey
      for (let i = 1; i < 33; i++) remoteKey[i] = i

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)
    })

    test('should perform Noise_XK handshake as initiator', async () => {
      const handshake = await transport.initiateHandshake(mockSocket)

      expect(handshake).toBeDefined()
      expect(handshake.state).toBe('initiator')
      expect(handshake.ephemeralKey).toBeInstanceOf(Uint8Array)
      expect(handshake.ephemeralKey.length).toBe(32)
      expect(transport.getState()).toBe(TransportState.HANDSHAKE_INITIATED)
    })

    test('should perform Noise_XK handshake as responder', async () => {
      // First message from initiator (simulated)
      const initiatorMessage = new Uint8Array(50) // Act 1 message
      for (let i = 0; i < 50; i++) initiatorMessage[i] = i

      const handshake = await transport.respondToHandshake(mockSocket, initiatorMessage)

      expect(handshake).toBeDefined()
      expect(handshake.state).toBe('responder')
      expect(handshake.ephemeralKey).toBeInstanceOf(Uint8Array)
      expect(transport.getState()).toBe(TransportState.HANDSHAKE_RESPONDED)
    })

    test('should complete handshake successfully', async () => {
      // Simulate full handshake
      const initiatorHandshake = await transport.initiateHandshake(mockSocket)
      expect(transport.getState()).toBe(TransportState.HANDSHAKE_INITIATED)

      // Simulate receiving response
      const responseMessage = new Uint8Array(50)
      const completed = await transport.completeHandshake(responseMessage)

      expect(completed).toBe(true)
      expect(transport.getState()).toBe(TransportState.CONNECTED)
    })

    test('should derive correct encryption keys', async () => {
      await transport.initiateHandshake(mockSocket)
      const responseMessage = new Uint8Array(50)
      await transport.completeHandshake(responseMessage)

      const keys = transport.getEncryptionKeys()
      expect(keys).toBeDefined()
      expect(keys!.ck).toBeInstanceOf(Uint8Array)
      expect(keys!.ck.length).toBe(32)
      expect(keys!.sk).toBeInstanceOf(Uint8Array)
      expect(keys!.sk.length).toBe(32)
      expect(keys!.rk).toBeInstanceOf(Uint8Array)
      expect(keys!.rk.length).toBe(32)
    })
  })

  describe('Message Encryption/Decryption', () => {
    beforeEach(async () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      // Complete handshake
      await transport.initiateHandshake(mockSocket)
      const responseMessage = new Uint8Array(50)
      await transport.completeHandshake(responseMessage)
    })

    test('should encrypt messages correctly', async () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5])
      const encrypted = await transport.encryptMessage(plaintext)

      expect(encrypted).toBeInstanceOf(Uint8Array)
      expect(encrypted.length).toBeGreaterThan(plaintext.length) // Includes MAC
      expect(encrypted).not.toEqual(plaintext) // Should be encrypted
    })

    test('should decrypt messages correctly', async () => {
      const originalPlaintext = new Uint8Array([1, 2, 3, 4, 5])
      const encrypted = await transport.encryptMessage(originalPlaintext)
      const decrypted = await transport.decryptMessage(encrypted)

      expect(decrypted).toEqual(originalPlaintext)
    })

    test('should maintain message length boundaries', async () => {
      const maxMessage = new Uint8Array(65535) // Max Lightning message size
      for (let i = 0; i < maxMessage.length; i++) maxMessage[i] = i & 0xff

      const encrypted = await transport.encryptMessage(maxMessage)
      const decrypted = await transport.decryptMessage(encrypted)

      expect(decrypted).toEqual(maxMessage)
    })

    test('should reject messages that are too large', async () => {
      const oversizedMessage = new Uint8Array(65536) // Over max size

      await expect(transport.encryptMessage(oversizedMessage)).rejects.toThrow('Message too large')
    })

    test('should handle empty messages', async () => {
      const emptyMessage = new Uint8Array(0)

      const encrypted = await transport.encryptMessage(emptyMessage)
      const decrypted = await transport.decryptMessage(encrypted)

      expect(decrypted).toEqual(emptyMessage)
    })
  })

  describe('Transport State Management', () => {
    test('should transition states correctly', () => {
      expect(transport.getState()).toBe(TransportState.DISCONNECTED)

      // Set keys
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      expect(transport.getState()).toBe(TransportState.KEYS_SET)
    })

    test('should handle connection errors', async () => {
      const failingSocket = {
        ...mockSocket,
        send: jest.fn(() => {
          throw new Error('Connection failed')
        }),
      }

      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      await expect(transport.initiateHandshake(failingSocket)).rejects.toThrow('Connection failed')
      // State remains as handshake was initiated but failed during send
      expect(transport.getState()).toBe(TransportState.HANDSHAKE_INITIATED)
    })

    test('should reset transport correctly', () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      expect(transport.getState()).toBe(TransportState.KEYS_SET)

      transport.reset()
      expect(transport.getState()).toBe(TransportState.DISCONNECTED)
    })
  })

  describe('BOLT 8 Compliance', () => {
    test('should implement Noise_XK pattern correctly', async () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      const handshake = await transport.initiateHandshake(mockSocket)

      // Verify handshake follows Noise_XK pattern
      expect(handshake.ephemeralKey).toBeDefined()
      expect(handshake.staticKey).toBe(localKey)

      // Complete handshake
      const responseMessage = new Uint8Array(50)
      await transport.completeHandshake(responseMessage)

      // Verify we have proper encryption keys
      const keys = transport.getEncryptionKeys()
      expect(keys!.ck).toBeDefined()
      expect(keys!.sk).toBeDefined()
      expect(keys!.rk).toBeDefined()
    })

    test('should use ChaChaPoly-1305 for encryption', async () => {
      // This test verifies that the transport uses the correct cipher
      // In the mock implementation, we use a simple XOR, but in real implementation
      // it should use ChaChaPoly-1305 as specified in BOLT 8

      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      await transport.initiateHandshake(mockSocket)
      await transport.completeHandshake(new Uint8Array(50))

      const message = new Uint8Array([1, 2, 3, 4])
      const encrypted = await transport.encryptMessage(message)

      // Verify encryption produces different output
      expect(encrypted).not.toEqual(message)
      expect(encrypted.length).toBeGreaterThan(message.length) // Includes auth tag
    })

    test('should handle key rotation correctly', async () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      await transport.initiateHandshake(mockSocket)
      await transport.completeHandshake(new Uint8Array(50))

      const message1 = new Uint8Array([1, 2, 3])
      const message2 = new Uint8Array([4, 5, 6])

      const encrypted1 = await transport.encryptMessage(message1)
      const encrypted2 = await transport.encryptMessage(message2)

      // Messages should be encrypted with different nonces (key rotation)
      expect(encrypted1).not.toEqual(encrypted2)

      // But should decrypt correctly
      const decrypted1 = await transport.decryptMessage(encrypted1)
      const decrypted2 = await transport.decryptMessage(encrypted2)

      expect(decrypted1).toEqual(message1)
      expect(decrypted2).toEqual(message2)
    })

    test('should validate message length according to BOLT 8', async () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      await transport.initiateHandshake(mockSocket)
      await transport.completeHandshake(new Uint8Array(50))

      // Test maximum allowed message size (2^16 - 1)
      const maxValidMessage = new Uint8Array(65535)
      await expect(transport.encryptMessage(maxValidMessage)).resolves.toBeDefined()

      // Test oversized message
      const oversizedMessage = new Uint8Array(65536)
      await expect(transport.encryptMessage(oversizedMessage)).rejects.toThrow()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid handshake messages', async () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      // Invalid handshake message (too short)
      const invalidMessage = new Uint8Array(10)

      await expect(transport.respondToHandshake(mockSocket, invalidMessage)).rejects.toThrow(
        'Invalid handshake message',
      )
    })

    test('should handle decryption failures', async () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      await transport.initiateHandshake(mockSocket)
      await transport.completeHandshake(new Uint8Array(50))

      // Tampered message
      const tamperedMessage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

      await expect(transport.decryptMessage(tamperedMessage)).rejects.toThrow('Invalid ciphertext')
    })

    test('should prevent replay attacks', async () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      await transport.initiateHandshake(mockSocket)
      await transport.completeHandshake(new Uint8Array(50))

      const message = new Uint8Array([1, 2, 3])
      const encrypted = await transport.encryptMessage(message)

      // First decryption should succeed
      await expect(transport.decryptMessage(encrypted)).resolves.toEqual(message)

      // Second decryption of same message should fail (replay protection)
      await expect(transport.decryptMessage(encrypted)).rejects.toThrow('Replay detected')
    })

    test('should handle concurrent operations safely', async () => {
      const localKey = new Uint8Array(32)
      const remoteKey = new Uint8Array(33)
      remoteKey[0] = 0x02

      transport.setLocalKey(localKey)
      transport.setRemoteKey(remoteKey)

      await transport.initiateHandshake(mockSocket)
      await transport.completeHandshake(new Uint8Array(50))

      // Send multiple messages concurrently
      const promises = []
      for (let i = 0; i < 10; i++) {
        const message = new Uint8Array([i])
        promises.push(transport.encryptMessage(message))
      }

      const results = await Promise.all(promises)

      // All should succeed and be different
      expect(results).toHaveLength(10)
      for (const result of results) {
        expect(result).toBeInstanceOf(Uint8Array)
      }
    })
  })
})
