import bip32vectors from './test-vectors/bip32-vectors'
import bip49Vectors from './test-vectors/bip49-vectors'
import bip84Vectors from './test-vectors/bip84-vectors'

import { createWallet } from '../wallet'
import {
  createPublicKey,
  deriveAccount,
  privateKeyToWIF,
  serializePrivateKey,
  serializePublicKey,
} from '@/services/key'
import { hexToUint8Array, toBase58, uint8ArrayToHex } from '@/services/crypto'

describe('Wallet', () => {
  test('Create wallet', () => {
    const wallet = createWallet('test wallet', false, [
      {
        purpose: 84,
        coinTypes: [0],
        accountIndex: 0,
      },
    ])
    expect(wallet).toBeDefined()
  })

  // BIP32 HD wallet
  describe('BIP32 HD wallet', () => {
    bip32vectors.forEach((vector, index) => {
      const bytes = hexToUint8Array(vector?.seed || '')
      const wallet = createWallet('test wallet', false, [])

      describe(`Test vector ${index + 1}`, () => {
        Object.keys(vector?.chains)?.forEach(path => {
          test(`path ${path}`, () => {
            const pathSegments = segments

            const derivedKey = deriveAccount(wallet.privateKey, wallet.chainCode, path)

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
            const derivedKey = deriveAccount(wallet.privateKey, wallet.chainCode, path)

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
            const derivedKey = deriveAccount(wallet.privateKey, wallet.chainCode, path)

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
import {createPublicKey, deriveAccount, privateKeyToWIF, serializePrivateKey, serializePublicKey, serializePublicKeyForSegWit} from '@/shared/lib/bitcoin/key'
import {hexToUint8Array, toBase58} from '@/shared/lib/bitcoin/crypto'
import bip84Vectors from "./test-vectors/bip84-vectors";


 */
