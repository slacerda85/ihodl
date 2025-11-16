import { mnemonicToSeedSync } from '@/core/lib/bip39'
import { hmacSeed } from '@/core/lib/crypto'
import { createPublicKey, deriveChildPrivateKey, splitRootExtendedKey } from '@/core/lib/key'
import { Account, AccountIndex, Change, CoinType, Purpose } from '@/core/models/account'

type DeriveAccountKeysParams = Partial<Account> & {
  masterKey: Uint8Array
}

interface KeyServiceInterface {
  createMasterKey(seed: string): Uint8Array

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

class KeyService implements KeyServiceInterface {
  createMasterKey(seed: string): Uint8Array {
    const entropy = mnemonicToSeedSync(seed)
    const masterKey = hmacSeed(entropy)
    return masterKey
  }

  deriveAccountKeys({
    masterKey,
    purpose = Purpose.BIP84,
    coinType = CoinType.Bitcoin,
    accountIndex = AccountIndex.Main,
  }: DeriveAccountKeysParams) {
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

const keyService = new KeyService()

export default keyService
