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

// Mock para expo-crypto
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
  digestStringAsync: jest.fn(),
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

// Configuração global para testes
global.console = {
  ...console,
  // Suprime logs durante testes
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}
