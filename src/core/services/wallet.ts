import { randomUUID } from '../lib/crypto'
import { createHardenedIndex } from '../lib/key'
import { Account, CoinType, Purpose } from '../models/account'
import { Wallet } from '../models/wallet'
import { SeedService } from './seed'
import { WalletRepository } from '../repositories/wallet'

type CreateWalletParams = Omit<Wallet, 'id'> & {
  seed?: string
  password?: string
}

interface WalletServiceInterface {
  createWallet(params: CreateWalletParams): Promise<Wallet>
  getWalletById(id: string): Promise<Wallet | null>
  getAllWallets(): Wallet[]
}

export class WalletService implements WalletServiceInterface {
  async createWallet(params: CreateWalletParams): Promise<Wallet> {
    const id = randomUUID()
    const { name, cold, accounts, seed, password } = params

    if (accounts.length === 0) {
      const defaultAccount: Account = {
        purpose: Purpose.BIP84,
        coinType: CoinType.Bitcoin,
        accountIndex: createHardenedIndex(0),
      }

      accounts.push(defaultAccount)
    }

    // save seed phrase if provided
    if (seed) {
      const seedService = new SeedService()
      await seedService.saveSeedForWalletId(id, seed, password)
    }

    const newWallet: Wallet = {
      id,
      name,
      cold: cold ?? false,
      accounts,
    }

    // save wallet to storage
    const walletRepository = new WalletRepository()
    await walletRepository.save(newWallet)

    return newWallet
  }

  async getWalletById(id: string): Promise<Wallet | null> {
    const walletRepository = new WalletRepository()
    const wallet = await walletRepository.findById(id)
    return wallet
  }

  getAllWallets(): Wallet[] {
    const walletRepository = new WalletRepository()
    const wallets = walletRepository.findAll()
    return wallets
  }
}
