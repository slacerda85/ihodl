import {
  fromMnemonic,
  deriveChildKey,
  createPublicKey,
  splitMasterKey,
  createMasterKey,
} from '../key'

// Test mnemonic for consistent test vectors across all Lightning tests
export const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

// Generate test node ID from the standard test mnemonic
export function generateTestNodeId(): Uint8Array {
  const testSeed = fromMnemonic(TEST_MNEMONIC)
  const masterKey = createMasterKey(testSeed) // m/0'
  const childKey = deriveChildKey(masterKey, 0x80000000)
  const { privateKey } = splitMasterKey(childKey)
  return createPublicKey(privateKey)
}

// Generate test private key from the standard test mnemonic
export function generateTestPrivateKey(): Uint8Array {
  const testSeed = fromMnemonic(TEST_MNEMONIC)
  const masterKey = createMasterKey(testSeed) // m/0'
  const childKey = deriveChildKey(masterKey, 0x80000000)
  const { privateKey } = splitMasterKey(childKey)
  return privateKey
}

// Generate test keypair from the standard test mnemonic
export function generateTestKeypair() {
  const privateKey = generateTestPrivateKey()
  const publicKey = createPublicKey(privateKey)
  return { privateKey, publicKey }
}
