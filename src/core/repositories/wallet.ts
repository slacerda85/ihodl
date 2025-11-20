import { Wallet } from '../models/wallet'
import { MMKV } from 'react-native-mmkv'

const walletStorage = new MMKV({
  id: 'wallet-storage',
})

interface WalletRepositoryInterface {
  save(wallet: Wallet): void
  findById(id: string): Wallet | null
  delete(id: string): void
  setActiveWalletId(id: string): void
  getActiveWalletId(): string
  findAll(): Wallet[]
  findAllIds(): string[]
  clear(): void
}

export class WalletRepository implements WalletRepositoryInterface {
  save(wallet: Wallet): void {
    walletStorage.set(`wallet_${wallet.id}`, JSON.stringify(wallet))
  }
  findById(id: string): Wallet | null {
    const walletData = walletStorage.getString(`wallet_${id}`)
    if (!walletData) {
      return null
    }
    return JSON.parse(walletData) as Wallet
  }
  findAll(): Wallet[] {
    const wallets: Wallet[] = []
    const keys = walletStorage.getAllKeys()
    for (const key of keys) {
      if (key.startsWith('wallet_')) {
        const walletData = walletStorage.getString(key)
        if (walletData) {
          wallets.push(JSON.parse(walletData) as Wallet)
        }
      }
    }
    return wallets
  }
  delete(id: string): void {
    walletStorage.delete(`wallet_${id}`)
  }
  setActiveWalletId(id: string): void {
    walletStorage.set('active_wallet_id', id)
  }
  getActiveWalletId(): string {
    return walletStorage.getString('active_wallet_id') || ''
  }
  findAllIds(): string[] {
    const wallets = this.findAll()
    return wallets.map(wallet => wallet.id)
  }
  clear(): void {
    walletStorage.clearAll()
  }
}

const walletRepository = new WalletRepository()

export default walletRepository
