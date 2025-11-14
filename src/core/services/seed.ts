import { entropyToMnemonic } from '../lib'
import { createEntropy } from '../lib/crypto'
import { SeedRepository } from '../repositories/seed'

interface SeedServiceInterface {
  createSeed(): string
  getSeedByWalletId(walletId: string): string
  getSeedByWalletIdWithPassword(walletId: string, password: string): string
  saveSeedForWalletId(walletId: string, seed: string): void
  deleteSeedByWalletId(walletId: string): void
}

export class SeedService implements SeedServiceInterface {
  createSeed(): string {
    const entropy = createEntropy(16) // 128 bits
    const seed = entropyToMnemonic(entropy)
    return seed
  }

  getSeedByWalletId(walletId: string): string {
    // Implementation to retrieve seed by wallet ID
    const seedRepository = new SeedRepository()
    const seed = seedRepository.findByWalletId(walletId)
    if (!seed) {
      throw new Error('Seed not found for the given wallet ID')
    }
    return seed
  }
  getSeedByWalletIdWithPassword(walletId: string, password: string): string {
    const seedRepository = new SeedRepository()
    const seed = seedRepository.findByWalletId(walletId, password)
    if (!seed) {
      throw new Error('Seed not found for the given wallet ID')
    }
    return seed
  }
  saveSeedForWalletId(walletId: string, seed: string, password?: string): void {
    // Implementation to save seed for a wallet ID
    const seedRepository = new SeedRepository()
    seedRepository.save(walletId, seed, password)
  }
  deleteSeedByWalletId(walletId: string): void {
    // Implementation to delete seed by wallet ID
    const seedRepository = new SeedRepository()
    seedRepository.deleteByWalletId(walletId)
  }
}
