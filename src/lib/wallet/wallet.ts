import { Account } from '@/lib/account'
import { fromMnemonic, toMnemonic } from '@/lib/key'
import { createEntropy, randomUUID } from '@/lib/crypto'
import { WalletData, CreateWalletParams, CreateWalletResult } from './types'
import { storeWalletSeedPhrase, getWalletSeedPhrase } from '@/lib/secureStorage'

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
      },
    ]

    const accountsToAdd = accounts ?? defaultAccounts

    const seedPhraseToUse = seedPhrase ?? toMnemonic(entropy)

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
    throw new Error('Failed to create wallet', {
      cause: JSON.stringify(error),
    })
  }
}

/**
 * Derives Lightning keys for an account based on its type
 * @param masterKey - The master extended key from seed
 * @param account - The account configuration
 * @returns The account with derived keys
 */

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
