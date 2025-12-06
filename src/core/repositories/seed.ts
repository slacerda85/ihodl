import { MMKV } from 'react-native-mmkv'
import { encryptSeed, decryptSeed } from '../lib/crypto'
import { RepositoryCloudBackupDecorator } from './cloud/repository-cloud-backup-decorator'

const seedStorage = new MMKV({
  id: 'seed-storage',
  encryptionKey: 'seed-storage-encryption-key-v1', // In production, derive from user password
})

interface SeedRepositoryInterface {
  save(seed: string, walletId: string, password?: string): void
  find(walletId: string, password?: string): string | null
  delete(walletId: string): void
  clear(): void
}

class SeedRepository implements SeedRepositoryInterface {
  private backupDecorator: RepositoryCloudBackupDecorator

  constructor() {
    this.backupDecorator = new RepositoryCloudBackupDecorator('seed')
  }

  save(walletId: string, seed: string, password?: string): void {
    const encryptedSeed = password ? encryptSeed(password, seed) : seed
    // Implementation to save seed
    seedStorage.set(`seed_${walletId}`, encryptedSeed)

    // Backup automático em nuvem (através do decorator)
    this.backupDecorator.wrapSave(
      () => {}, // Save já foi feito acima
      () => ({ seeds: { [walletId]: encryptedSeed } }), // Dados para backup
      () => `seed_${walletId}`, // Key generator
    )()
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

    // Backup automático em nuvem (através do decorator)
    this.backupDecorator.wrapDelete(
      () => {}, // Delete já foi feito acima
      () => `seed_${walletId}`, // Key generator
    )()
  }

  clear(): void {
    seedStorage.clearAll()

    // Backup automático em nuvem (através do decorator)
    this.backupDecorator.wrapClear(() => {})()
  }
}

const seedRepository = new SeedRepository()

export default seedRepository
