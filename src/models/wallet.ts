import { Account } from './account'

export type WalletData = {
  walletId: string
  walletName: string
  cold: boolean
  seedPhrase: string
  accounts: Account[]
}
