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

// Fix BigInt serialization for Jest worker communication
const originalStringify = JSON.stringify
JSON.stringify = function (value, replacer, space) {
  return originalStringify(
    value,
    (key, val) => {
      if (typeof val === 'bigint') {
        return { __bigint__: val.toString() }
      }
      return replacer ? replacer(key, val) : val
    },
    space,
  )
}

const originalParse = JSON.parse
JSON.parse = function (text, reviver) {
  return originalParse(text, (key, val) => {
    if (val && typeof val === 'object' && val.__bigint__) {
      return BigInt(val.__bigint__)
    }
    return reviver ? reviver(key, val) : val
  })
}
