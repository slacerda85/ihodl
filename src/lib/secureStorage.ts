import { MMKV } from 'react-native-mmkv'
import { encryptSeedPhrase, decryptSeedPhrase } from './crypto'

// Secure storage instance for sensitive wallet data
const secureStorage = new MMKV({
  id: 'wallet-secure-storage',
  encryptionKey: 'wallet-secure-key-v1', // This should be derived from user password in production
})

// Storage keys for different types of sensitive data
const STORAGE_KEYS = {
  WALLET_SEED_PHRASE: 'wallet_seed_phrase',
} as const

/**
 * Securely stores a wallet's seed phrase
 * @param walletId - The wallet identifier
 * @param seedPhrase - The seed phrase to encrypt and store
 * @param password - User password for encryption
 */
export async function storeWalletSeedPhrase(
  walletId: string,
  seedPhrase: string,
  password: string,
): Promise<void> {
  try {
    const encryptedSeed = encryptSeedPhrase(password, seedPhrase)
    secureStorage.set(`${STORAGE_KEYS.WALLET_SEED_PHRASE}_${walletId}`, encryptedSeed)
  } catch (error) {
    console.error('Error storing wallet seed phrase:', error)
    throw new Error('Failed to store wallet seed phrase securely')
  }
}

/**
 * Retrieves a wallet's seed phrase from secure storage
 * @param walletId - The wallet identifier
 * @param password - User password for decryption
 * @returns The decrypted seed phrase or null if not found
 */
export async function getWalletSeedPhrase(
  walletId: string,
  password?: string,
): Promise<string | null> {
  try {
    const encryptedSeed = secureStorage.getString(`${STORAGE_KEYS.WALLET_SEED_PHRASE}_${walletId}`)
    if (!encryptedSeed) {
      return null
    }

    const decryptedSeed = decryptSeedPhrase(password, encryptedSeed)
    return decryptedSeed
  } catch (error) {
    console.error('Error retrieving wallet seed phrase:', error)
    throw new Error('Failed to retrieve wallet seed phrase')
  }
}

/**
 * Removes a wallet's seed phrase from secure storage
 * @param walletId - The wallet identifier
 */
export async function removeWalletSeedPhrase(walletId: string): Promise<void> {
  try {
    secureStorage.delete(`${STORAGE_KEYS.WALLET_SEED_PHRASE}_${walletId}`)
  } catch (error) {
    console.error('Error removing wallet seed phrase:', error)
    throw new Error('Failed to remove wallet seed phrase')
  }
}

/**
 * Checks if a wallet's seed phrase exists in secure storage
 * @param walletId - The wallet identifier
 * @returns True if the seed phrase exists
 */
export function hasWalletSeedPhrase(walletId: string): boolean {
  try {
    return secureStorage.contains(`${STORAGE_KEYS.WALLET_SEED_PHRASE}_${walletId}`)
  } catch (error) {
    console.error('Error checking wallet seed phrase existence:', error)
    return false
  }
}

/**
 * Clears all wallet seed phrases from secure storage (use with caution)
 */
export async function clearAllWalletSeedPhrases(): Promise<void> {
  try {
    // Get all keys and remove wallet seed phrase keys
    const keys = secureStorage.getAllKeys()
    const seedKeys = keys.filter(key => key.startsWith(`${STORAGE_KEYS.WALLET_SEED_PHRASE}_`))

    for (const key of seedKeys) {
      secureStorage.delete(key)
    }
  } catch (error) {
    console.error('Error clearing all wallet seed phrases:', error)
    throw new Error('Failed to clear all wallet seed phrases')
  }
}
