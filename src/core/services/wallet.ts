import { randomUUID } from '@/core/lib/crypto'
import { createHardenedIndex } from '@/core/lib/key'
import { Account, CoinType, Purpose } from '@/core/models/account'
import { Wallet } from '@/core/models/wallet'
import { SeedService } from './seed'
import { WalletRepository } from '@/core/repositories/wallet'

type CreateWalletParams = Omit<Wallet, 'id'> & {
  seed?: string
  password?: string
}

interface WalletServiceInterface {
  createWallet(params: CreateWalletParams): Wallet
  getWalletById(id: string): Wallet | null
  getAllWallets(): Wallet[]
  editWallet(walletId: string, updates: Partial<Omit<Wallet, 'id'>>): void
  deleteWallet(walletId: string): void
}

export class WalletService implements WalletServiceInterface {
  createWallet(params: CreateWalletParams): Wallet {
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

    const seedService = new SeedService()
    // save seed phrase if provided
    const seedToStore = seed || seedService.createSeed()
    seedService.saveSeedForWalletId(id, seedToStore, password)

    const newWallet: Wallet = {
      id,
      name,
      cold: cold ?? false,
      accounts,
    }

    // save wallet to storage
    const walletRepository = new WalletRepository()
    walletRepository.save(newWallet)

    return newWallet
  }

  getWalletById(id: string): Wallet | null {
    const walletRepository = new WalletRepository()
    const wallet = walletRepository.findById(id)
    return wallet
  }

  getAllWallets(): Wallet[] {
    const walletRepository = new WalletRepository()
    const wallets = walletRepository.findAll()
    return wallets
  }

  editWallet(walletId: string, updates: Partial<Omit<Wallet, 'id'>>): void {
    const walletRepository = new WalletRepository()
    const wallet = walletRepository.findById(walletId)
    if (!wallet) {
      throw new Error('Wallet not found')
    }
    const updatedWallet = { ...wallet, ...updates }
    walletRepository.save(updatedWallet)
  }

  deleteWallet(walletId: string): void {
    const walletRepository = new WalletRepository()
    const wallet = walletRepository.findById(walletId)
    if (!wallet) {
      throw new Error('Wallet not found')
    }
    walletRepository.delete(walletId)
  }
}
