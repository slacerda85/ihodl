import { MMKV } from 'react-native-mmkv'
import { encryptSeed, decryptSeed } from '../lib/crypto'

const seedStorage = new MMKV({
  id: 'seed-storage',
  encryptionKey: 'seed-storage-encryption-key-v1', // In production, derive from user password
})

interface SeedRepositoryInterface {
  save(seed: string, walletId: string): Promise<void>
  findByWalletId(walletId: string): Promise<string | null>
  deleteByWalletId(walletId: string): Promise<void>
}

export class SeedRepository implements SeedRepositoryInterface {
  async save(walletId: string, seed: string, password?: string): Promise<void> {
    const encryptedSeed = password ? encryptSeed(password, seed) : seed
    // Implementation to save seed
    seedStorage.set(`seed_${walletId}`, encryptedSeed)
  }
  async findByWalletId(walletId: string, password?: string): Promise<string | null> {
    // Implementation to find seed by wallet ID
    const encryptedSeed = seedStorage.getString(`seed_${walletId}`) || null
    if (!encryptedSeed) {
      return null
    }
    const seed = password ? decryptSeed(password, encryptedSeed) : encryptedSeed
    return seed
  }
  async deleteByWalletId(walletId: string): Promise<void> {
    // Implementation to delete seed by wallet ID
    seedStorage.delete(`seed_${walletId}`)
  }
}
