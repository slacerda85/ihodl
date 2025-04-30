import { Account } from '@/models/account'
import { fromMnemonic, toMnemonic } from '@/lib/key'
import { createEntropy, randomUUID } from '@/lib/crypto'
import { WalletData } from '@/models/wallet'

export interface CreateWalletParams {
  walletName: string
  seedPhrase?: string
  cold: boolean
  accounts?: Account[]
}

/**
 * Creates a new wallet with the provided parameters
 *
 * @param {Object} params - The parameters for creating a wallet
 * @param {string} params.walletName - The name for the wallet
 * @param {string} [params.seedPhrase] - Optional seed phrase to restore a wallet. If not provided, a new one will be generated
 * @param {boolean} params.cold - Indicates if this is a cold wallet
 * @param {Account[]} [params.accounts] - Optional array of accounts to add to the wallet. If not provided, default accounts will be used
 *
 * @returns {WalletData} The newly created wallet data
 *
 * @throws {Error} When wallet creation fails
 *
 * @example
 * // Create a new wallet with a random seed phrase
 * const wallet = createWallet({
 *   walletName: "My Bitcoin Wallet",
 *   cold: false
 * });
 *
 * @example
 * // Restore a wallet from an existing seed phrase
 * const restoredWallet = createWallet({
 *   walletName: "Restored Wallet",
 *   seedPhrase: "your twelve word seed phrase here",
 *   cold: true
 * });
 */
function createWallet({ walletName, seedPhrase, cold, accounts }: CreateWalletParams): WalletData {
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
      // Bitcoin Taproot (future)
      {
        purpose: 86, // Taproot
        coinType: 0, // Bitcoin
        accountIndex: 0, // Default account index
      },
    ]

    const accountsToAdd = accounts ?? defaultAccounts

    const seedPhraseToUse = seedPhrase ?? toMnemonic(entropy)

    const newWallet: WalletData = {
      walletId,
      walletName,
      seedPhrase: seedPhraseToUse,
      cold,
      accounts: accountsToAdd,
    }
    return newWallet
  } catch (error) {
    console.error('Error creating wallet:', error)
    throw new Error('Failed to create wallet', {
      cause: JSON.stringify(error),
    })
  }
}

export { createWallet }
