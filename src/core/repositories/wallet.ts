import { Wallet } from '../models/wallet'
import { MMKV } from 'react-native-mmkv'

const walletStorage = new MMKV({
  id: 'wallet-storage',
})

interface WalletRepositoryInterface {
  save(wallet: Wallet): Promise<void>
  findById(id: string): Promise<Wallet | null>
  delete(id: string): Promise<void>
}

export class WalletRepository implements WalletRepositoryInterface {
  async save(wallet: Wallet): Promise<void> {
    walletStorage.set(`wallet_${wallet.id}`, JSON.stringify(wallet))
  }
  async findById(id: string): Promise<Wallet | null> {
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
  async delete(id: string): Promise<void> {
    walletStorage.delete(`wallet_${id}`)
  }
}
