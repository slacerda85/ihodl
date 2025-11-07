import { Account, LightningDerivedKeys } from '@/lib/account'
import {
  fromMnemonic,
  toMnemonic,
  createRootExtendedKey,
  deriveChildPrivateKey,
  createPublicKey,
  createHardenedIndex,
} from '@/lib/key'
import { createEntropy, randomUUID } from '@/lib/crypto'
import { WalletData, CreateWalletParams, CreateWalletResult } from './types'
import { storeWalletSeedPhrase, getWalletSeedPhrase } from '@/lib/secureStorage'
import { createSegwitAddress } from '@/lib/address'

/**
 * Creates a new wallet with the provided parameters
 *
 * @param {Object} params - The parameters for creating a wallet
 * @param {string} params.walletName - The name for the wallet
 * @param {string} [params.seedPhrase] - Optional seed phrase to restore a wallet. If not provided, a new one will be generated
 * @param {boolean} params.cold - Indicates if this is a cold wallet
 * @param {Account[]} [params.accounts] - Optional array of accounts to add to the wallet. If not provided, default accounts will be used
 *
 * @returns {CreateWalletResult} The newly created wallet data and seed phrase
 *
 * @throws {Error} When wallet creation fails
 *
 * @example
 * // Create a new wallet with a random seed phrase
 * const result = createWallet({
 *   walletName: "My Bitcoin Wallet",
 *   cold: false
 * });
 * console.log(result.seedPhrase); // Access the seed phrase
 * console.log(result.wallet); // Access the wallet data
 *
 * @example
 * // Restore a wallet from an existing seed phrase
 * const restoredResult = createWallet({
 *   walletName: "Restored Wallet",
 *   seedPhrase: "your twelve word seed phrase here",
 *   cold: true
 * });
 */
function createWallet({
  walletName,
  seedPhrase,
  cold,
  accounts,
}: CreateWalletParams): CreateWalletResult {
  try {
    const walletId = randomUUID()
    const entropy = seedPhrase ? fromMnemonic(seedPhrase) : createEntropy(16)

    const seedPhraseToUse = seedPhrase ?? toMnemonic(entropy)

    // Derive Lightning keys for the default Lightning account
    const lightningKeys = deriveLightningKeys(seedPhraseToUse)

    const defaultAccounts: Account[] = [
      // Bitcoin Native Segwit
      {
        purpose: 84, // Native SegWit
        coinType: 0, // Bitcoin
        accountIndex: 0, // Default account index
      },
      // Lightning Network
      {
        purpose: 9735, // Lightning
        coinType: 0, // Bitcoin
        accountIndex: 0, // Default account index
        lightning: {
          type: 'funding_wallet',
          chain: 0,
          lnVer: 1, // Lightning version
          derivedKeys: lightningKeys,
        },
      },
    ]

    const accountsToAdd = accounts ?? defaultAccounts

    const newWallet: WalletData = {
      walletId,
      walletName,
      cold,
      accounts: accountsToAdd,
    }
    return {
      wallet: newWallet,
      seedPhrase: seedPhraseToUse,
    }
  } catch (error) {
    console.error('Error creating wallet:', error)
    throw new Error('Failed to create wallet')
  }
}

/**
 * Derives Lightning keys for an account based on its type
 * @param masterKey - The master extended key from seed
 * @param account - The account configuration
 * @returns The account with derived keys
 */
export function deriveLightningKeys(
  seedPhrase: string,
  passphrase: string = '',
): LightningDerivedKeys {
  try {
    console.log('[deriveLightningKeys] Starting Lightning key derivation for seed phrase')

    // Convert mnemonic to seed
    console.log('[deriveLightningKeys] Converting mnemonic to seed')
    const seed = fromMnemonic(seedPhrase)
    console.log('[deriveLightningKeys] Seed generated, length:', seed.length)

    // Create master extended key
    console.log('[deriveLightningKeys] Creating master extended key')
    const masterKey = createRootExtendedKey(seed)
    console.log('[deriveLightningKeys] Master key created, length:', masterKey.length)

    // Derive Lightning purpose (9735')
    console.log("[deriveLightningKeys] Deriving Lightning purpose (9735')")
    const lightningPurposeIndex = createHardenedIndex(9735)
    const lightningPurposeKey = deriveChildPrivateKey(masterKey, lightningPurposeIndex)
    console.log(
      '[deriveLightningKeys] Lightning purpose key derived, length:',
      lightningPurposeKey.length,
    )

    // Derive coin type (0')
    console.log("[deriveLightningKeys] Deriving coin type (0')")
    const coinTypeIndex = createHardenedIndex(0)
    const coinTypeKey = deriveChildPrivateKey(lightningPurposeKey, coinTypeIndex)
    console.log('[deriveLightningKeys] Coin type key derived, length:', coinTypeKey.length)

    // Derive account (0')
    console.log("[deriveLightningKeys] Deriving account (0')")
    const accountIndex = createHardenedIndex(0)
    const accountKey = deriveChildPrivateKey(coinTypeKey, accountIndex)
    console.log('[deriveLightningKeys] Account key derived, length:', accountKey.length)

    // Derive node key (0/0)
    console.log('[deriveLightningKeys] Deriving node key (0/0)')
    const nodeChangeKey = deriveChildPrivateKey(accountKey, 0)
    const nodeKey = deriveChildPrivateKey(nodeChangeKey, 0)
    console.log('[deriveLightningKeys] Node key derived, length:', nodeKey.length)

    // Extract private and public keys
    console.log('[deriveLightningKeys] Extracting node private and public keys')
    const nodePrivateKey = nodeKey.subarray(0, 32)
    const nodePublicKey = createPublicKey(nodePrivateKey)
    console.log(
      '[deriveLightningKeys] Node keys extracted - private key length:',
      nodePrivateKey.length,
      'public key length:',
      nodePublicKey.length,
    )

    // Create node ID (compressed public key)
    const nodeId = nodePublicKey.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
    console.log('[deriveLightningKeys] Node ID created:', nodeId.substring(0, 10) + '...')

    // Derive funding key (0/1)
    console.log('[deriveLightningKeys] Deriving funding key (0/1)')
    const fundingChangeKey = deriveChildPrivateKey(accountKey, 0)
    const fundingKey = deriveChildPrivateKey(fundingChangeKey, 1)
    console.log('[deriveLightningKeys] Funding key derived, length:', fundingKey.length)

    const fundingPrivateKey = fundingKey.subarray(0, 32)
    const fundingPublicKey = createPublicKey(fundingPrivateKey)
    console.log(
      '[deriveLightningKeys] Funding keys extracted - private key length:',
      fundingPrivateKey.length,
      'public key length:',
      fundingPublicKey.length,
    )

    // Create a proper P2WPKH address for funding using the existing address library
    console.log('[deriveLightningKeys] Creating funding address')
    const fundingAddress = createSegwitAddress(fundingPublicKey)
    console.log('[deriveLightningKeys] Funding address created:', fundingAddress)

    console.log('[deriveLightningKeys] Lightning key derivation completed successfully')

    return {
      nodeKey: {
        privateKey: nodePrivateKey,
        publicKey: nodePublicKey,
        nodeId,
      },
      fundingKeys: {
        privateKey: fundingPrivateKey,
        publicKey: fundingPublicKey,
        address: fundingAddress,
      },
    }
  } catch (error) {
    console.error('[deriveLightningKeys] Error deriving Lightning keys:', error)
    throw new Error('Failed to derive Lightning keys')
  }
}

/**
 * Securely stores a wallet's seed phrase
 * @param walletId - The wallet identifier
 * @param seedPhrase - The seed phrase to encrypt and store
 * @param password - User password for encryption
 */
export async function storeWalletSeed(
  walletId: string,
  seedPhrase: string,
  password: string,
): Promise<void> {
  return storeWalletSeedPhrase(walletId, seedPhrase, password)
}

/**
 * Retrieves a wallet's seed phrase from secure storage
 * @param walletId - The wallet identifier
 * @param password - User password for decryption
 * @returns The decrypted seed phrase or null if not found
 */
export async function getWalletSeed(walletId: string, password: string): Promise<string | null> {
  return getWalletSeedPhrase(walletId, password)
}

export { createWallet }
