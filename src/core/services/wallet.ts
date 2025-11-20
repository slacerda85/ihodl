import { randomUUID } from '@/core/lib/crypto'
import { Wallet } from '@/core/models/wallet'
import SeedService from './seed'
import { WalletRepository } from '@/core/repositories/wallet'

export type CreateWalletParams = Omit<Wallet, 'id'> & {
  seed?: string
  password?: string
}

interface WalletServiceInterface {
  createWallet(params: CreateWalletParams): Wallet
  getAllWallets(): Wallet[]
  getWalletIds(): string[]
  editWallet(walletId: string, updates: Partial<Omit<Wallet, 'id'>>): void
  deleteWallet(walletId: string): void
  getActiveWalletId(): string
  toggleActiveWallet(walletId: string): void
}

export default class WalletService implements WalletServiceInterface {
  createWallet({ name, cold, seed, password }: CreateWalletParams): Wallet {
    // create seed
    const seedService = new SeedService()
    const seedToStore = seed ?? seedService.createSeed()
    const id = randomUUID()
    seedService.saveSeed(id, seedToStore, password)
    // create wallet
    const newWallet: Wallet = {
      id,
      name,
      cold: cold ?? false,
    }
    // save wallet
    const walletRepository = new WalletRepository()
    walletRepository.save(newWallet)
    // set as active wallet
    walletRepository.setActiveWalletId(id)
    return newWallet
  }

  getWalletIds(): string[] {
    const walletRepository = new WalletRepository()
    const wallets = walletRepository.findAll()
    return wallets.map(wallet => wallet.id)
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

  getActiveWalletId(): string {
    const walletRepository = new WalletRepository()
    return walletRepository.getActiveWalletId()
  }

  toggleActiveWallet(walletId: string): void {
    const walletRepository = new WalletRepository()
    walletRepository.setActiveWalletId(walletId)
  }

  deleteWallet(walletId: string): void {
    const walletRepository = new WalletRepository()
    walletRepository.delete(walletId)
    // check active id
    const activeWalletId = walletRepository.getActiveWalletId()
    if (activeWalletId === walletId) {
      const remainingWallets = walletRepository.findAll()
      if (remainingWallets.length > 0) {
        walletRepository.setActiveWalletId(remainingWallets[0].id)
      } else {
        walletRepository.setActiveWalletId('')
      }
    }
  }

  getAllWallets(): Wallet[] {
    const walletRepository = new WalletRepository()
    return walletRepository.findAll()
  }
}
