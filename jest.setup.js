// Setup file for Jest tests

// Polyfills for TextEncoder/TextDecoder
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock para react-native-mmkv
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(),
    getNumber: jest.fn(),
    getBoolean: jest.fn(),
    delete: jest.fn(),
    getAllKeys: jest.fn(),
  })),
}))

// Mock para expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

// Mock para react-native-quick-crypto
jest.mock('react-native-quick-crypto', () => ({
  randomBytes: jest.fn(),
  createHash: jest.fn(),
  createHmac: jest.fn(),
}))

// Mock para @noble/hashes
jest.mock('@noble/hashes/sha2', () => ({
  sha256: jest.fn(data => {
    // Simple mock implementation - return a Uint8Array of 32 bytes
    const result = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      result[i] = data[i % data.length] || 0
    }
    return result
  }),
}))

// Mock para @noble/hashes/hmac
jest.mock('@noble/hashes/hmac', () => ({
  create: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => new Uint8Array(32)),
    })),
  })),
  hmac: jest.fn(() => new Uint8Array(64)), // For hmacSHA512
}))

// Mock para @noble/hashes/pbkdf2
jest.mock('@noble/hashes/pbkdf2', () => ({
  pbkdf2: jest.fn(() => new Uint8Array(64)),
  pbkdf2Async: jest.fn(() => Promise.resolve(new Uint8Array(64))),
}))

// Mock para @noble/hashes/utils
jest.mock('@noble/hashes/utils', () => ({
  randomBytes: jest.fn(size => new Uint8Array(size)),
  hmacSeed: jest.fn(entropy => {
    // Simple mock - return entropy extended to 64 bytes
    const result = new Uint8Array(64)
    for (let i = 0; i < 64; i++) {
      result[i] = entropy[i % entropy.length] || 0
    }
    return result
  }),
}))

// Mock para src/core/lib/crypto/crypto.ts
jest.mock('./src/core/lib/crypto/crypto', () => ({
  sha256: jest.fn(data => {
    // Simple mock implementation - return a Uint8Array of 32 bytes
    const result = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      result[i] = data[i % data.length] || 0
    }
    return result
  }),
  uint8ArrayToHex: jest.fn(arr => {
    return Array.from(arr)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }),
  hexToUint8Array: jest.fn(hex => {
    const length = hex.length / 2
    const array = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
      array[i] = parseInt(hex.substr(i * 2, 2), 16)
    }
    return array
  }),
  // Removed createHash mock to test real implementation
  hmacSeed: jest.fn(entropy => {
    // Simple mock - return entropy extended to 64 bytes
    const result = new Uint8Array(64)
    for (let i = 0; i < 64; i++) {
      result[i] = entropy[i % entropy.length] || 0
    }
    return result
  }),
  hmacSHA512: jest.fn(() => new Uint8Array(64)),
  signMessage: jest.fn(() => new Uint8Array(64)), // Mock signature
  verifyMessage: jest.fn(() => true), // Mock verification always succeeds
  createEntropy: jest.fn(size => new Uint8Array(size)),
  randomUUID: jest.fn(() => 'mock-uuid'),
  encryptSeedPhrase: jest.fn(() => 'encrypted'),
  decryptSeedPhrase: jest.fn(() => 'decrypted'),
  signMessageHex: jest.fn(() => 'signature'),
  verifyMessageHex: jest.fn(() => true),
}))

// Mock para react-native-tcp-socket
jest.mock('react-native-tcp-socket', () => ({
  TcpSocket: jest.fn(),
  TcpServer: jest.fn(),
}))

// Mock para tls
jest.mock('tls', () => ({
  connect: jest.fn(),
}))

// Mock para net
jest.mock('net', () => ({
  connect: jest.fn(),
}))

// Global console mocks
global.console = {
  ...console,
  // Suprime logs durante testes
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}
