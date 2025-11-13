import { MMKV } from 'react-native-mmkv'

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
  async save(seed: string, walletId: string): Promise<void> {
    // Implementation to save seed
    seedStorage.set(`seed_${walletId}`, seed)
  }
  async findByWalletId(walletId: string): Promise<string | null> {
    // Implementation to find seed by wallet ID
    return seedStorage.getString(`seed_${walletId}`) || null
  }
  async deleteByWalletId(walletId: string): Promise<void> {
    // Implementation to delete seed by wallet ID
    seedStorage.delete(`seed_${walletId}`)
  }
}
