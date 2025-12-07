import { entropyToMnemonic } from '../lib/bips/bip39'
import { createEntropy } from '../lib/crypto'
import SeedRepository from '../repositories/seed'

interface SeedServiceInterface {
  createSeed(): string
  getSeed(walletId: string, password?: string): string
  saveSeed(walletId: string, seed: string): void
  deleteSeed(walletId: string): void
}

export default class SeedService implements SeedServiceInterface {
  createSeed(): string {
    const entropy = createEntropy(16) // 128 bits
    const seed = entropyToMnemonic(entropy)
    return seed
  }

  getSeed(walletId: string, password?: string): string {
    const seed = SeedRepository.find(walletId, password)
    if (!seed) {
      throw new Error('Seed not found for the given wallet ID')
    }
    return seed
  }
  saveSeed(walletId: string, seed: string, password?: string): void {
    // Implementation to save seed for a wallet ID
    SeedRepository.save(walletId, seed, password)
  }
  deleteSeed(walletId: string): void {
    // Implementation to delete seed by wallet ID
    SeedRepository.delete(walletId)
  }
}
