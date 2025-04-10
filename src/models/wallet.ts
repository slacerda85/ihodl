import { Account } from './account'

export type WalletData = {
  walletId: string
  walletName: string
  cold: boolean
  extendedKey: Uint8Array
  accounts: Account[]
}

export type WalletDataRaw = Omit<WalletData, 'extendedKey'> & {
  extendedKeyRaw: Record<string, string>
}
