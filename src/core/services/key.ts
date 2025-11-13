import { mnemonicToSeedSync } from '@/core/lib/bip39'
import { hmacSeed } from '@/core/lib/crypto'
import {
  createHardenedIndex,
  createPublicKey,
  deriveChildPrivateKey,
  splitRootExtendedKey,
} from '@/core/lib/key'
import { Account, AccountPath } from '@/core/models/account'
import { createAddress } from '@/core/lib/address'

type DeriveAccountKeysParams = Account & {
  masterKey: Uint8Array
}

type DeriveParams = AccountPath & {
  masterKey: Uint8Array
}

interface KeyServiceInterface {
  createMasterKey(seed: string): Promise<Uint8Array>
  derive(params: DeriveParams): Uint8Array
  deriveAccountKeys(params: DeriveAccountKeysParams): {
    receivingAccountKey: Uint8Array // key for m/purpose'/coinType'/account'/0
    changeAccountKey: Uint8Array // key for m/purpose'/coinType'/account'/1
  }
  deriveAddressIndexKeys(
    accountKey: Uint8Array,
    index: number,
  ): {
    addressIndexKey: Uint8Array // private key for m/purpose'/coinType'/account'/change/index
  }
  deriveAddressPublicKey(addressIndexKey: Uint8Array): Uint8Array
}

export class KeyService implements KeyServiceInterface {
  async createMasterKey(seed: string): Promise<Uint8Array> {
    const entropy = mnemonicToSeedSync(seed)
    const masterKey = hmacSeed(entropy)
    return masterKey
  }

  derive({
    masterKey,
    purpose,
    coinType,
    accountIndex,
    change,
    addressIndex,
  }: DeriveParams): Uint8Array {
    const accountExtendedKey = [purpose, coinType, accountIndex]
      .map(createHardenedIndex)
      .reduce(deriveChildPrivateKey, masterKey)
    const changeExtendedKey = deriveChildPrivateKey(accountExtendedKey, change)
    const addressIndexKey = deriveChildPrivateKey(changeExtendedKey, addressIndex)
    return addressIndexKey
  }

  deriveAccountKeys({ masterKey, purpose, coinType, accountIndex }: DeriveAccountKeysParams) {
    const accountExtendedKey = [purpose, coinType, accountIndex]
      .map(createHardenedIndex)
      .reduce(deriveChildPrivateKey, masterKey)
    return {
      receivingAccountKey: deriveChildPrivateKey(accountExtendedKey, 0),
      changeAccountKey: deriveChildPrivateKey(accountExtendedKey, 1),
    }
  }

  deriveAddressIndexKeys(
    accountKey: Uint8Array,
    index: number,
  ): {
    addressIndexKey: Uint8Array
  } {
    const addressIndexKey = deriveChildPrivateKey(accountKey, index)

    return {
      addressIndexKey,
    }
  }

  deriveAddressPublicKey(addressIndexKey: Uint8Array): Uint8Array {
    const { privateKey } = splitRootExtendedKey(addressIndexKey)
    const addressPublicKey = createPublicKey(privateKey)
    return addressPublicKey
  }
}
