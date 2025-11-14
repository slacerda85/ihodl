import { mnemonicToSeedSync } from '@/core/lib/bip39'
import { hmacSeed } from '@/core/lib/crypto'
import { createPublicKey, deriveChildPrivateKey, splitRootExtendedKey } from '@/core/lib/key'
import { Account, Change } from '@/core/models/account'

type DeriveAccountKeysParams = Account & {
  masterKey: Uint8Array
}

interface KeyServiceInterface {
  createMasterKey(seed: string): Promise<Uint8Array>

  deriveAccountKeys(params: DeriveAccountKeysParams): {
    receivingAccountKey: Uint8Array // key for m/purpose'/coinType'/account'/0
    changeAccountKey: Uint8Array // key for m/purpose'/coinType'/account'/1
  }
  deriveAddressKeys(
    accountKey: Uint8Array,
    index: number,
  ): {
    addressKey: Uint8Array // private key for m/purpose'/coinType'/account'/change/index
  }
  deriveAddressPublicKey(addressKey: Uint8Array): Uint8Array
}

export class KeyService implements KeyServiceInterface {
  async createMasterKey(seed: string): Promise<Uint8Array> {
    const entropy = mnemonicToSeedSync(seed)
    const masterKey = hmacSeed(entropy)
    return masterKey
  }

  deriveAccountKeys({ masterKey, purpose, coinType, accountIndex }: DeriveAccountKeysParams) {
    const accountKey = [purpose, coinType, accountIndex]
      // .map(createHardenedIndex)
      .reduce(deriveChildPrivateKey, masterKey)
    return {
      receivingAccountKey: deriveChildPrivateKey(accountKey, Change.Receiving),
      changeAccountKey: deriveChildPrivateKey(accountKey, Change.Change),
    }
  }

  deriveAddressKeys(
    accountKey: Uint8Array,
    index: number,
  ): {
    addressKey: Uint8Array
  } {
    const addressKey = deriveChildPrivateKey(accountKey, index)

    return {
      addressKey,
    }
  }

  deriveAddressPublicKey(addressKey: Uint8Array): Uint8Array {
    const { privateKey } = splitRootExtendedKey(addressKey)
    const addressPublicKey = createPublicKey(privateKey)
    return addressPublicKey
  }
}
