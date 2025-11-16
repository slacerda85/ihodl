import { entropyToMnemonic } from '../lib'
import { createEntropy } from '../lib/crypto'
import { SeedRepository } from '../repositories/seed'

interface SeedServiceInterface {
  createSeed(): string
  getSeed(walletId: string, password?: string): string
  saveSeed(walletId: string, seed: string): void
  deleteSeed(walletId: string): void
}

class SeedService implements SeedServiceInterface {
  createSeed(): string {
    const entropy = createEntropy(16) // 128 bits
    const seed = entropyToMnemonic(entropy)
    return seed
  }

  getSeed(walletId: string, password?: string): string {
    const seedRepository = new SeedRepository()
    const seed = seedRepository.find(walletId, password)
    if (!seed) {
      throw new Error('Seed not found for the given wallet ID')
    }
    return seed
  }
  saveSeed(walletId: string, seed: string, password?: string): void {
    // Implementation to save seed for a wallet ID
    const seedRepository = new SeedRepository()
    seedRepository.save(walletId, seed, password)
  }
  deleteSeed(walletId: string): void {
    // Implementation to delete seed by wallet ID
    const seedRepository = new SeedRepository()
    seedRepository.delete(walletId)
  }
}

const seedService = new SeedService()

export default seedService
