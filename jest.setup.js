/* global jest */

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

// Serializer for BigInt
const bigIntSerializer = {
  serialize: val => val.toString(),
  deserialize: val => BigInt(val),
  test: val => typeof val === 'bigint',
}

expect.addSnapshotSerializer(bigIntSerializer)
