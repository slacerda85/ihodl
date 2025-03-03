import bip32vectors from './test-vectors/bip32-vectors'
import bip49Vectors from './test-vectors/bip49-vectors'
import bip84Vectors from './test-vectors/bip84-vectors'
import Wallet from './wallet'
import {
  createPublicKey,
  deriveFromPath,
  privateKeyToWIF,
  serializePrivateKey,
  serializePublicKey,
  serializePublicKeyForSegWit,
} from '@/shared/lib/bitcoin/key'
import { hexToUint8Array, toBase58, uint8ArrayToHex } from '@/shared/lib/bitcoin/crypto'
/* 
interface WalletTestVector {
  seed?: string
  mnemonic?: string
  chains: {
    [path: string]: {
      privKey: string
      pubKey: string
      address?: string
    }
  }
}

interface KeyPairResult {
  privKeyHash: string
  pubKeyHash: string
  privateKey?: string
  publicKey: Uint8Array
  address?: string
}

const deriveKeyPair = (
  wallet: Wallet,
  path: string,
  version: {
    private: Buffer,
    public: Buffer
  }
): KeyPairResult => {
  const derivedKey = deriveFromPath(
    wallet.privateKey,
    wallet.chainCode,
    path
  )

  const serializedPrivateKey = serializePrivateKey(
    derivedKey.derivedKey,
    derivedKey.derivedChainCode,
    derivedKey.depth,
    derivedKey.parentFingerprint,
    derivedKey.childIndex,
    version.private
  )

  const publicKey = createPublicKey(derivedKey.derivedKey)
  const serializedPublicKey = serializePublicKey(
    publicKey,
    derivedKey.derivedChainCode,
    derivedKey.depth,
    derivedKey.parentFingerprint,
    derivedKey.childIndex,
    version.public
  )

  return {
    privKeyHash: toBase58(serializedPrivateKey),
    pubKeyHash: toBase58(serializedPublicKey),
    privateKey: privateKeyToWIF(derivedKey.derivedKey),
    publicKey,
    address: serializePublicKeyForSegWit(publicKey, 0)
  }
}

describe("Wallet", () => {
  test("should create an empty wallet", () => {
    const wallet = new Wallet()
    expect(wallet).toBeDefined()
  })

  const testWalletVector = (
    description: string,
    vectors: WalletTestVector[],
    version: { private: Buffer, public: Buffer },
    options: { testAddress?: boolean } = {}
  ) => {
    describe(description, () => {
      vectors.forEach((vector, index) => {
        const seed = vector.seed ? hexToUint8Array(vector.seed) : undefined
        const wallet = new Wallet(seed, vector.mnemonic)

        describe(`Vector ${index + 1}`, () => {
          Object.entries(vector.chains).forEach(([path, expected]) => {
            describe(`Path: ${path}`, () => {
              const result = deriveKeyPair(wallet, path, version)

              test("should derive correct key pair", () => {
                if (result.privKeyHash.startsWith('prv', 1) && result.pubKeyHash.startsWith('pub', 1)) {
                  expect(result.privKeyHash).toBe(vector.chains[path].privKey);
                  expect(result.pubKeyHash).toBe(vector.chains[path].pubKey);
                } 
                
              })

              if (options.testAddress && expected.address) {
                test("should derive correct address", () => {
                  expect(result.address).toBe(expected.address)
                })

                test("should derive correct public key", () => {
                  expect(uint8ArrayToHex(result.publicKey)).toBe(expected.pubKey)
                })

                test("should derive correct private key", () => {
                  expect(result.privateKey).toBe(expected.privKey)
                })
              }
            })
          })
        })
      })
    })
  }
  

  // Test BIP32 HD wallet
  testWalletVector(
    "BIP32 HD wallet",
    bip32vectors,
    {
      private: Buffer.from([0x04, 0x88, 0xad, 0xe4]), // xprv
      public: Buffer.from([0x04, 0x88, 0xb2, 0x1e])   // xpub
    }
  )

  // Test BIP49 HD wallet
  testWalletVector(
    "BIP49 HD wallet",
    bip49Vectors,
    {
      private: Buffer.from([0x04, 0x4a, 0x4e, 0x28]), // uprv
      public: Buffer.from([0x04, 0x4a, 0x52, 0x62])   // upub
    }
  )

  // Test BIP84 HD wallet
  testWalletVector(
    "BIP84 HD wallet",
    bip84Vectors,
    {
      private: Buffer.from([0x04, 0xb2, 0x43, 0x0c]), // zprv
      public: Buffer.from([0x04, 0xb2, 0x47, 0x46])   // zpub
    },
    { testAddress: true }
  )
}) */

describe('Wallet', () => {
  test('Create wallet', () => {
    const wallet = new Wallet()
    expect(wallet).toBeDefined()
  })

  // BIP32 HD wallet
  describe('BIP32 HD wallet', () => {
    bip32vectors.forEach((vector, index) => {
      const bytes = hexToUint8Array(vector?.seed || '')
      const wallet = new Wallet(bytes, vector?.mnemonic)

      describe(`Test vector ${index + 1}`, () => {
        Object.keys(vector?.chains)?.forEach(path => {
          test(`path ${path}`, () => {
            const derivedKey = deriveFromPath(wallet.privateKey, wallet.chainCode, path)

            const serializedPrivateKey = serializePrivateKey(
              derivedKey.derivedKey,
              derivedKey.derivedChainCode,
              derivedKey.depth,
              derivedKey.parentFingerprint,
              derivedKey.childIndex,
              Buffer.from([0x04, 0x88, 0xad, 0xe4]), // xprv
            )

            const publicKey = createPublicKey(derivedKey.derivedKey)

            const serializedPublicKey = serializePublicKey(
              publicKey,
              derivedKey.derivedChainCode,
              derivedKey.depth,
              derivedKey.parentFingerprint,
              derivedKey.childIndex,
              Buffer.from([0x04, 0x88, 0xb2, 0x1e]), // xpub
            )

            const privKeyHash = toBase58(serializedPrivateKey)
            const pubKeyHash = toBase58(serializedPublicKey)

            expect(privKeyHash).toBe(vector.chains[path].privKey)
            expect(pubKeyHash).toBe(vector.chains[path].pubKey)
          })
        })
      })
    })
  })

  // BIP49 HD wallet
  describe('BIP49 HD wallet', () => {
    bip49Vectors.forEach((vector, index) => {
      const wallet = new Wallet(undefined, vector?.mnemonic)

      describe(`Test vector ${index + 1}`, () => {
        Object.keys(vector?.chains)?.forEach(path => {
          test(`path ${path}`, () => {
            const derivedKey = deriveFromPath(wallet.privateKey, wallet.chainCode, path)

            const serializedPrivateKey = serializePrivateKey(
              derivedKey.derivedKey,
              derivedKey.derivedChainCode,
              derivedKey.depth,
              derivedKey.parentFingerprint,
              derivedKey.childIndex,
              Buffer.from([0x04, 0x4a, 0x4e, 0x28]), // uprv
            )

            const publicKey = createPublicKey(derivedKey.derivedKey)

            const serializedPublicKey = serializePublicKey(
              publicKey,
              derivedKey.derivedChainCode,
              derivedKey.depth,
              derivedKey.parentFingerprint,
              derivedKey.childIndex,
              Buffer.from([0x04, 0x4a, 0x52, 0x62]), // upub
            )

            const privKeyHash = toBase58(serializedPrivateKey)
            const pubKeyHash = toBase58(serializedPublicKey)

            expect(privKeyHash).toBe(vector.chains[path].privKey)
            expect(pubKeyHash).toBe(vector.chains[path].pubKey)
          })
        })
      })
    })
  })

  // BIP84 HD wallet
  describe('BIP84 HD wallet', () => {
    bip84Vectors.forEach((vector, index) => {
      const wallet = new Wallet(undefined, vector?.mnemonic)

      describe(`Test vector ${index + 1}`, () => {
        Object.keys(vector?.chains)?.forEach(path => {
          describe(`path ${path}`, () => {
            const derivedKey = deriveFromPath(wallet.privateKey, wallet.chainCode, path)

            const serializedPrivateKey = serializePrivateKey(
              derivedKey.derivedKey,
              derivedKey.derivedChainCode,
              derivedKey.depth,
              derivedKey.parentFingerprint,
              derivedKey.childIndex,
              Buffer.from([0x04, 0xb2, 0x43, 0x0c]), // zprv
            )

            const privateKey = privateKeyToWIF(derivedKey.derivedKey)
            const publicKey = createPublicKey(derivedKey.derivedKey)

            const serializedPublicKey = serializePublicKey(
              publicKey,
              derivedKey.derivedChainCode,
              derivedKey.depth,
              derivedKey.parentFingerprint,
              derivedKey.childIndex,
              Buffer.from([0x04, 0xb2, 0x47, 0x46]), // zpub
            )

            const privKeyHash = toBase58(serializedPrivateKey)
            const pubKeyHash = toBase58(serializedPublicKey)

            test('zprv/zpub', () => {
              if (
                vector.chains[path].privKey.startsWith('zprv') &&
                vector.chains[path].pubKey.startsWith('zpub')
              ) {
                expect(privKeyHash).toBe(vector.chains[path].privKey)
                expect(pubKeyHash).toBe(vector.chains[path].pubKey)
              }
            })

            if (vector.chains[path].address) {
              const address = serializePublicKeyForSegWit(publicKey, 0)
              test('public key', () => {
                expect(uint8ArrayToHex(publicKey)).toBe(vector.chains[path].pubKey)
              })
              test('private key', () => {
                expect(privateKey).toBe(vector.chains[path].privKey)
              })
              test('address', () => {
                expect(address).toBe(vector.chains[path].address)
              })
            }
          })
        })
      })
    })
  })
})

/* import bip32vectors from "./test-vectors/bip32-vectors"
import bip49Vectors from "./test-vectors/bip49-vectors"
import Wallet from "./wallet";
import {createPublicKey, deriveFromPath, privateKeyToWIF, serializePrivateKey, serializePublicKey, serializePublicKeyForSegWit} from '@/shared/lib/bitcoin/key'
import {hexToUint8Array, toBase58} from '@/shared/lib/bitcoin/crypto'
import bip84Vectors from "./test-vectors/bip84-vectors";


 */
