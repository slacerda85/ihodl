import { SeedRepository } from '../repositories/seed'

interface SeedServiceInterface {
  getSeedByWalletId(walletId: string): Promise<string>
  saveSeedForWalletId(walletId: string, seed: string): Promise<void>
  deleteSeedByWalletId(walletId: string): Promise<void>
}

export class SeedService implements SeedServiceInterface {
  async getSeedByWalletId(walletId: string): Promise<string> {
    // Implementation to retrieve seed by wallet ID
    const seedRepository = new SeedRepository()
    const seed = await seedRepository.findByWalletId(walletId)
    if (!seed) {
      throw new Error('Seed not found for the given wallet ID')
    }
    return seed
  }
  async saveSeedForWalletId(walletId: string, seed: string, password?: string): Promise<void> {
    // Implementation to save seed for a wallet ID
    const seedRepository = new SeedRepository()
    await seedRepository.save(walletId, seed, password)
  }
  async deleteSeedByWalletId(walletId: string): Promise<void> {
    // Implementation to delete seed by wallet ID
    const seedRepository = new SeedRepository()
    await seedRepository.deleteByWalletId(walletId)
  }
}
