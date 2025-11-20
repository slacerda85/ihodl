import { MMKV } from 'react-native-mmkv'
import { WalletAccount } from '../models/account'

const accountStorage = new MMKV({
  id: 'account-storage',
})

interface AccountRepositoryInterface {
  all(): WalletAccount[]
  save(walletAccount: WalletAccount): void
  read(walletId: string): WalletAccount[]
  delete(walletId: string): void
  clear(): void
}

export default class AccountRepository implements AccountRepositoryInterface {
  save(walletAccount: WalletAccount): void {
    const { walletId, purpose, coinType, accountIndex, change, addressIndex } = walletAccount
    const key = `account_${walletId}_${purpose}_${coinType}_${accountIndex}_${change}_${addressIndex}`
    accountStorage.set(key, JSON.stringify(walletAccount))
  }

  read(walletId: string): WalletAccount[] {
    const accounts: WalletAccount[] = []
    const keys = accountStorage.getAllKeys()
    for (const key of keys) {
      if (key.startsWith(`account_${walletId}_`)) {
        const accountData = accountStorage.getString(key)
        if (accountData) {
          accounts.push(JSON.parse(accountData) as WalletAccount)
        }
      }
    }
    return accounts
  }

  delete(walletId: string): void {
    const keys = accountStorage.getAllKeys()
    for (const key of keys) {
      if (key.startsWith(`account_${walletId}_`)) {
        accountStorage.delete(key)
      }
    }
  }
  clear(): void {
    accountStorage.clearAll()
  }

  all(): WalletAccount[] {
    const accounts: WalletAccount[] = []
    const keys = accountStorage.getAllKeys()
    for (const key of keys) {
      if (key.startsWith(`account_`)) {
        const accountData = accountStorage.getString(key)
        if (accountData) {
          accounts.push(JSON.parse(accountData) as WalletAccount)
        }
      }
    }
    return accounts
  }
}
