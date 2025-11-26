import { mnemonicToSeedSync } from '@/core/lib/bip39'
import { hmacSeed } from '@/core/lib/crypto'
import { createPublicKey, deriveChildKey, splitMasterKey } from '@/core/lib/key'
import { AccountIndex, Change, CoinType, DerivationPath, Purpose } from '@/core/models/address'

type DeriveAccountKeysParams = Partial<DerivationPath> & {
  masterKey: Uint8Array
}

interface KeyServiceInterface {
  // createMasterKey(seed: string): Uint8Array
  derive(seed: string, derivationPath: Partial<DerivationPath>): Uint8Array
  deriveAccountKey(seed: string): Uint8Array
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

export default class KeyService implements KeyServiceInterface {
  createMasterKey(seed: string): Uint8Array {
    const entropy = mnemonicToSeedSync(seed)
    const masterKey = hmacSeed(entropy)
    return masterKey
  }

  deriveAccountKey(seed: string): Uint8Array {
    const masterKey = this.createMasterKey(seed)
    return [Purpose.BIP84, CoinType.Bitcoin, AccountIndex.Main].reduce(deriveChildKey, masterKey)
  }

  deriveAccountKeys({
    masterKey,
    purpose = Purpose.BIP84,
    coinType = CoinType.Bitcoin,
    accountIndex = AccountIndex.Main,
  }: DeriveAccountKeysParams) {
    const accountKey = [purpose, coinType, accountIndex].reduce(deriveChildKey, masterKey)
    return {
      receivingAccountKey: deriveChildKey(accountKey, Change.Receiving),
      changeAccountKey: deriveChildKey(accountKey, Change.Change),
    }
  }

  derive(seed: string, derivationPath: Partial<DerivationPath>): Uint8Array {
    const masterKey = this.createMasterKey(seed)
    return Object.values(derivationPath)
      .filter(v => v !== undefined)
      .reduce(deriveChildKey, masterKey)
  }

  deriveAddressKeys(
    accountKey: Uint8Array,
    index: number,
  ): {
    addressKey: Uint8Array
  } {
    const addressKey = deriveChildKey(accountKey, index)

    return {
      addressKey,
    }
  }

  deriveAddressPublicKey(addressKey: Uint8Array): Uint8Array {
    const { privateKey } = splitMasterKey(addressKey)
    const addressPublicKey = createPublicKey(privateKey)
    return addressPublicKey
  }
}
