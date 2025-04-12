import { AccountToAdd } from './account'

export type WalletData = {
  walletId: string
  walletName: string
  cold: boolean
  seedPhrase: string
  accounts: AccountToAdd[]
}
