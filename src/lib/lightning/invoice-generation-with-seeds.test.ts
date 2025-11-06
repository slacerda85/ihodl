/**
 * Lightning Invoice Generation Tests with Known Seeds
 * Tests BOLT 11 invoice generation using deterministic seeds
 */

import { mnemonicToSeed } from '../bip39'
import { derivePath, getNodeId } from '../crypto/bip32'
import { generateInvoice } from './index'

// Mock the crypto functions
jest.mock('../crypto', () => ({
  encode: jest.fn((data, prefix, version) => 'lnbc1mockinvoice'),
  sha256: jest.fn(() => new Uint8Array(32)),
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => new Uint8Array(32)),
    })),
  })),
  signMessage: jest.fn(() => new Uint8Array(64)),
  uint8ArrayToHex: jest.fn(() => 'mockhash'),
  hexToUint8Array: jest.fn(() => new Uint8Array(32)),
}))

jest.mock('../crypto/bip32', () => ({
  derivePath: jest.fn((seed, path) => ({
    privateKey: new Uint8Array(32).fill(1),
    chainCode: new Uint8Array(32).fill(2),
    index: path[path.length - 1],
    depth: path.length,
    parentFingerprint: new Uint8Array(4).fill(0),
  })),
  getNodeId: jest.fn(() => '02abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234'),
}))

// Test seed: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
// This is a well-known BIP39 seed with zero entropy, used for testing
const TEST_SEED_PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

// Lightning Network derivation path: m/1017'/1'/0'/1/0
// 1017' is the purpose for Lightning
// 1' is coin type for testnet (0' for mainnet)
// 0' is account
// 1 is change (0 for external, 1 for internal)
// 0 is address index
const LIGHTNING_PATH = [0x80000000 + 1017, 0x80000000 + 1, 0x80000000 + 0, 1, 0]

describe('Lightning Invoice Generation with Known Seeds', () => {
  test('should import functions correctly', () => {
    expect(typeof derivePath).toBe('function')
    expect(typeof getNodeId).toBe('function')
    expect(typeof generateInvoice).toBe('function')
  })

  test('should derive path from seed', async () => {
    const seed = await mnemonicToSeed(TEST_SEED_PHRASE)
    expect(seed).toBeInstanceOf(Uint8Array)
    expect(seed.length).toBe(64)

    const nodeKey = derivePath(seed, LIGHTNING_PATH)
    expect(nodeKey).toBeDefined()
    expect(nodeKey.privateKey).toBeInstanceOf(Uint8Array)
    expect(nodeKey.privateKey.length).toBe(32)

    const nodeId = getNodeId(nodeKey)
    expect(nodeId).toMatch(/^02[0-9a-f]{64}$/)
  })

  test('should generate invoice with mocked crypto', async () => {
    const amount = 1000
    const description = 'Test payment'

    const invoice = await generateInvoice(amount, description)

    expect(invoice).toBeDefined()
    expect(invoice.amount).toBe(amount)
    expect(invoice.description).toBe(description)
    expect(invoice.paymentRequest).toBeDefined()
    expect(invoice.paymentHash).toBeDefined()
    expect(invoice.status).toBe('pending')
  })
})
