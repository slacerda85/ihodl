import { Account } from './account'

export type WalletData = {
  walletId: string
  walletName: string
  cold: boolean
  // seedPhrase removed - now stored encrypted in secureStorage
  accounts: Account[]
}
