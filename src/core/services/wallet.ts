import { randomUUID } from '@/core/lib/crypto'
import { Wallet } from '@/core/models/wallet'
import SeedService from './seed'
import { WalletRepository } from '@/core/repositories/wallet'
import { fromMnemonic, createMasterKey } from '../lib/key'
// import { AccountService } from './account'

// Lazy import to avoid circular dependency
type AddressServiceType = import('./address').default

function getAddressService(): AddressServiceType {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return new (require('./address').default)()
}

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
  getActiveWalletId(): string | undefined
  toggleActiveWallet(walletId: string): void
  clear(): void
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

  getActiveWalletId(): string | undefined {
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
    // is required to delete associated accounts, seeds, etc.
    const seedService = new SeedService()
    seedService.deleteSeed(walletId)

    const addressService = getAddressService()
    addressService.clearAddresses()

    // check active id
    const activeWalletId = walletRepository.getActiveWalletId()
    if (activeWalletId === walletId) {
      const remainingWallets = walletRepository.findAll()
      if (remainingWallets.length > 0) {
        walletRepository.setActiveWalletId(remainingWallets[0].id)
      } else {
        walletRepository.setActiveWalletId(undefined)
      }
    }
  }

  getAllWallets(): Wallet[] {
    const walletRepository = new WalletRepository()
    return walletRepository.findAll()
  }

  getMasterKey(walletId: string, password?: string): Uint8Array {
    const seedService = new SeedService()
    const mnemonic = seedService.getSeed(walletId, password)
    const seed = fromMnemonic(mnemonic)
    const masterKey = createMasterKey(seed)
    return masterKey
  }

  clear(): void {
    const walletRepository = new WalletRepository()
    walletRepository.clear()
  }
}

/** Singleton instance for stateless operations */
export const walletService = new WalletService()
