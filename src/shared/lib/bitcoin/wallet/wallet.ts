import { createEntropy, hexToUint8Array, hmacSeed } from '@/shared/lib/bitcoin/crypto'
import {
  createMasterKey,
  createPublicKey,
  fromMnemonic,
  toMnemonic,
} from '@/shared/lib/bitcoin/key'

export default class Wallet {
  // #mnemonic: string;
  #privateKey: Uint8Array
  #chainCode: Uint8Array
  #publicKey: Uint8Array

  constructor(bytes?: Uint8Array, mnemonic?: string, privateKey?: Uint8Array | string) {
    if (bytes) {
      const { masterKey, chainCode } = createMasterKey(bytes)
      this.#privateKey = masterKey
      // this.#mnemonic = toMnemonic(this.#privateKey);
      this.#chainCode = chainCode
    } else if (privateKey) {
      // TODO: validate private key
      this.#privateKey =
        typeof privateKey === 'string' ? this.#toUint8Array(privateKey) : privateKey
      // this.#mnemonic = toMnemonic(this.#privateKey);
      this.#chainCode = hmacSeed(this.#privateKey).subarray(32)
    } else if (mnemonic) {
      // this.#mnemonic = mnemonic;
      const seed = fromMnemonic(mnemonic)
      const { masterKey, chainCode } = createMasterKey(seed)
      this.#privateKey = masterKey
      this.#chainCode = chainCode
    } else {
      const entropy = createEntropy(16)
      // this.#mnemonic = toMnemonic(entropy);
      const { masterKey, chainCode } = createMasterKey(entropy)
      this.#privateKey = masterKey

      this.#chainCode = chainCode
    }
    this.#publicKey = createPublicKey(this.#privateKey)
  }

  get privateKey() {
    return this.#privateKey
  }

  get chainCode() {
    return this.#chainCode
  }

  get mnemonic() {
    return toMnemonic(this.#privateKey)
  }

  get publicKey() {
    return this.#publicKey
  }

  /* #toBuffer(string: string): Buffer {
    return Buffer.from(string, "hex");
  } */

  #toUint8Array(string: string): Uint8Array {
    // cant use Buffer
    return hexToUint8Array(string)
  }
}
