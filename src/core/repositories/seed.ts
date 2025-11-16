import { MMKV } from 'react-native-mmkv'
import { encryptSeed, decryptSeed } from '../lib/crypto'

const seedStorage = new MMKV({
  id: 'seed-storage',
  encryptionKey: 'seed-storage-encryption-key-v1', // In production, derive from user password
})

interface SeedRepositoryInterface {
  save(seed: string, walletId: string, password?: string): void
  find(walletId: string, password?: string): string | null
  delete(walletId: string): void
}

export class SeedRepository implements SeedRepositoryInterface {
  save(walletId: string, seed: string, password?: string): void {
    const encryptedSeed = password ? encryptSeed(password, seed) : seed
    // Implementation to save seed
    seedStorage.set(`seed_${walletId}`, encryptedSeed)
  }
  find(walletId: string, password?: string): string | null {
    // Implementation to find seed by wallet ID
    const encryptedSeed = seedStorage.getString(`seed_${walletId}`) || null
    if (!encryptedSeed) {
      return null
    }
    const seed = password ? decryptSeed(password, encryptedSeed) : encryptedSeed
    return seed
  }
  delete(walletId: string): void {
    // Implementation to delete seed by wallet ID
    seedStorage.delete(`seed_${walletId}`)
  }
}
