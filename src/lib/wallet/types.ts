import { Account } from '@/lib/account'

export type WalletData = {
  walletId: string
  walletName: string
  cold: boolean
  // seedPhrase removed - now stored encrypted in secureStorage
  accounts: Account[]
}

export interface CreateWalletParams {
  walletName: string
  seedPhrase?: string
  cold: boolean
  accounts?: Account[]
}

export interface CreateWalletResult {
  wallet: WalletData
  seedPhrase: string
}
